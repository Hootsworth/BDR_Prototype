"""Firebase Admin bridge for Firestore and Clerk session verification.

Production deployments should run on Google Cloud with Application Default
Credentials. A service-account private key must never be checked into this repo.
"""

import os
import base64
import gzip
import hashlib
import json
import time
from datetime import datetime, timezone, timedelta
from functools import lru_cache
from threading import Lock, local
from uuid import uuid4


class FirebaseBackendUnavailable(RuntimeError):
    pass


class FirebaseTokenInvalid(ValueError):
    pass


class FirebaseStateConflict(RuntimeError):
    pass


_vercel_oidc_token = ""
_vercel_oidc_token_lock = Lock()


def set_vercel_oidc_token(token):
    """Cache the latest short-lived Vercel token for Firestore's gRPC callback."""
    global _vercel_oidc_token
    value = str(token or "").strip()
    if value:
        with _vercel_oidc_token_lock:
            _vercel_oidc_token = value


class _VercelOidcSubjectTokenSupplier:
    def get_subject_token(self, context, request):
        with _vercel_oidc_token_lock:
            token = _vercel_oidc_token
        if not token:
            raise FirebaseBackendUnavailable(
                "The Vercel request is missing its OIDC identity token. Enable Vercel Secure Backend Access and configure Google Workload Identity Federation."
            )
        return token


def _vercel_firebase_credential(firebase_admin):
    required = (
        "GCP_PROJECT_NUMBER",
        "GCP_WORKLOAD_IDENTITY_POOL_ID",
        "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
        "GCP_SERVICE_ACCOUNT_EMAIL",
    )
    missing = [name for name in required if not str(os.environ.get(name) or "").strip()]
    if missing:
        raise FirebaseBackendUnavailable(
            "Vercel Firestore access requires Google Workload Identity Federation settings: "
            + ", ".join(missing)
            + "."
        )
    try:
        from google.auth.identity_pool import Credentials as IdentityPoolCredentials
    except ImportError as exc:
        raise FirebaseBackendUnavailable(
            "The google-auth package with Workload Identity Federation support is required."
        ) from exc

    project_number = str(os.environ["GCP_PROJECT_NUMBER"]).strip()
    pool_id = str(os.environ["GCP_WORKLOAD_IDENTITY_POOL_ID"]).strip()
    provider_id = str(os.environ["GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID"]).strip()
    service_account = str(os.environ["GCP_SERVICE_ACCOUNT_EMAIL"]).strip()
    audience = (
        f"//iam.googleapis.com/projects/{project_number}/locations/global/"
        f"workloadIdentityPools/{pool_id}/providers/{provider_id}"
    )
    google_credential = IdentityPoolCredentials(
        audience=audience,
        subject_token_type="urn:ietf:params:oauth:token-type:jwt",
        token_url="https://sts.googleapis.com/v1/token",
        service_account_impersonation_url=(
            "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"
            f"{service_account}:generateAccessToken"
        ),
        subject_token_supplier=_VercelOidcSubjectTokenSupplier(),
        scopes=["https://www.googleapis.com/auth/datastore"],
    )

    class VercelFederatedCredential(firebase_admin.credentials.Base):
        def get_credential(self):
            return google_credential

    return VercelFederatedCredential()


def configured_project_id():
    return str(os.environ.get("FIREBASE_PROJECT_ID") or "").strip()


def firestore_enabled():
    return str(os.environ.get("FIREBASE_USE_FIRESTORE") or "").lower() == "true"


@lru_cache(maxsize=1)
def _admin_app():
    project_id = configured_project_id()
    if not project_id:
        raise FirebaseBackendUnavailable("FIREBASE_PROJECT_ID is not configured.")

    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError as exc:
        raise FirebaseBackendUnavailable("The Firebase Admin SDK is not installed.") from exc

    try:
        try:
            return firebase_admin.get_app()
        except ValueError:
            is_vercel = bool(os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV"))
            if is_vercel and os.environ.get("GCP_WORKLOAD_IDENTITY_POOL_ID"):
                credential = _vercel_firebase_credential(firebase_admin)
            elif is_vercel:
                raise FirebaseBackendUnavailable(
                    "Vercel Firestore access requires Google Workload Identity Federation settings."
                )
            else:
                credential = credentials.ApplicationDefault()
            return firebase_admin.initialize_app(
                credential,
                {"projectId": project_id},
            )
    except FirebaseBackendUnavailable:
        raise
    except Exception as exc:
        raise FirebaseBackendUnavailable(
            "Firebase Admin credentials are unavailable. Configure Application Default Credentials."
        ) from exc


@lru_cache(maxsize=1)
def _clerk_jwks_client():
    try:
        import jwt
        from jwt import PyJWKClient
    except ImportError as exc:
        raise FirebaseBackendUnavailable("PyJWT is required to verify Clerk sessions.") from exc
    issuer = str(os.environ.get("CLERK_ISSUER") or "").strip().rstrip("/")
    if not issuer:
        raise FirebaseBackendUnavailable("CLERK_ISSUER is not configured.")
    return PyJWKClient(f"{issuer}/.well-known/jwks.json", timeout=5), issuer


def verify_clerk_token(token):
    value = str(token or "").strip()
    if not value:
        raise FirebaseTokenInvalid("A Clerk session token is required.")
    try:
        import jwt
    except ImportError as exc:
        raise FirebaseBackendUnavailable("PyJWT is required to verify Clerk sessions.") from exc
    try:
        client, issuer = _clerk_jwks_client()
        signing_key = client.get_signing_key_from_jwt(value)
        claims = jwt.decode(
            value,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"require": ["exp", "iat", "iss", "sub"]},
            leeway=30,
        )
    except FirebaseBackendUnavailable:
        raise
    except Exception as exc:
        raise FirebaseTokenInvalid("The Clerk session token is invalid or expired.") from exc
    return claims


def bearer_token(headers):
    value = str(headers.get("Authorization") or "").strip()
    if not value.lower().startswith("bearer "):
        return ""
    return value[7:].strip()


@lru_cache(maxsize=1)
def _firestore_client():
    if not firestore_enabled():
        raise FirebaseBackendUnavailable("FIREBASE_USE_FIRESTORE is not enabled.")
    try:
        from firebase_admin import firestore
        return firestore.client(app=_admin_app())
    except FirebaseBackendUnavailable:
        raise
    except Exception as exc:
        raise FirebaseBackendUnavailable("Firestore is unavailable for this Firebase project.") from exc


class FirestoreStateStore:
    """Compressed, versioned whole-state snapshots for prototype compatibility.

    This is a migration bridge, not the final normalized product schema. Snapshots
    are chunked below Firestore's document limit and activated with one manifest
    transaction so a partial upload is never visible as current state.
    """

    chunk_bytes = 700 * 1024
    batch_size = 400

    def __init__(self):
        self._versions = local()

    def _version_map(self):
        if not hasattr(self._versions, "by_key"):
            self._versions.by_key = {}
        return self._versions.by_key

    def read(self, key):
        client = _firestore_client()
        manifest_ref = client.collection("appState").document(str(key))
        manifest = manifest_ref.get()
        active_version = (manifest.to_dict() or {}).get("activeVersion") if manifest.exists else None
        self._version_map()[str(key)] = active_version
        if not active_version:
            return {}

        version_ref = manifest_ref.collection("versions").document(active_version)
        version = version_ref.get()
        if not version.exists:
            raise FirebaseBackendUnavailable("The active Firebase state snapshot is missing.")
        version_data = version.to_dict() or {}
        snapshots = version_ref.collection("chunks").order_by("index").stream()
        compressed = b"".join((snapshot.to_dict() or {}).get("content", b"") for snapshot in snapshots)
        if hashlib.sha256(compressed).hexdigest() != version_data.get("sha256"):
            raise FirebaseBackendUnavailable("The Firebase state snapshot failed its integrity check.")
        try:
            decoded = gzip.decompress(compressed).decode("utf-8")
            return json.loads(decoded)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise FirebaseBackendUnavailable("The Firebase state snapshot could not be decoded.") from exc

    def write(self, key, value):
        client = _firestore_client()
        key = str(key)
        manifest_ref = client.collection("appState").document(key)
        versions = self._version_map()
        if key not in versions:
            manifest = manifest_ref.get()
            versions[key] = (manifest.to_dict() or {}).get("activeVersion") if manifest.exists else None
        expected_version = versions[key]
        raw = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        compressed = gzip.compress(raw, mtime=0)
        version_id = uuid4().hex
        version_ref = manifest_ref.collection("versions").document(version_id)
        chunk_count = max(1, (len(compressed) + self.chunk_bytes - 1) // self.chunk_bytes)

        batch = client.batch()
        pending = 0
        for index in range(chunk_count):
            start = index * self.chunk_bytes
            chunk = compressed[start:start + self.chunk_bytes]
            batch.set(version_ref.collection("chunks").document(f"{index:06d}"), {
                "index": index,
                "content": chunk,
            })
            pending += 1
            if pending >= self.batch_size:
                batch.commit()
                batch = client.batch()
                pending = 0
        batch.set(version_ref, {
            "chunkCount": chunk_count,
            "uncompressedBytes": len(raw),
            "sha256": hashlib.sha256(compressed).hexdigest(),
        })
        batch.commit()

        try:
            from google.cloud import firestore as google_firestore
            transaction = client.transaction()

            @google_firestore.transactional
            def activate(transaction):
                current = manifest_ref.get(transaction=transaction)
                current_version = (current.to_dict() or {}).get("activeVersion") if current.exists else None
                if current_version != expected_version:
                    raise FirebaseStateConflict("Firebase state changed while this request was being saved; reload and retry.")
                transaction.set(manifest_ref, {
                    "activeVersion": version_id,
                    "updatedAt": google_firestore.SERVER_TIMESTAMP,
                    "revision": int((current.to_dict() or {}).get("revision", 0)) + 1 if current.exists else 1,
                })

            activate(transaction)
        except FirebaseStateConflict:
            # Leave the unreferenced snapshot for a scheduled cleanup job.
            raise
        except Exception as exc:
            raise FirebaseBackendUnavailable("Could not activate the new Firebase state snapshot.") from exc

        self._version_map()[key] = version_id
        # Retain only the active snapshot after a successful pointer swap.
        # Cloud Run is configured with one instance and concurrency one for this
        # compatibility store, so no request can still be reading an old version.
        for old_version in manifest_ref.collection("versions").stream():
            if old_version.id == version_id:
                continue
            old_ref = old_version.reference
            old_chunks = old_ref.collection("chunks").stream()
            cleanup = client.batch()
            pending = 0
            for old_chunk in old_chunks:
                cleanup.delete(old_chunk.reference)
                pending += 1
                if pending >= self.batch_size:
                    cleanup.commit()
                    cleanup = client.batch()
                    pending = 0
            cleanup.delete(old_ref)
            cleanup.commit()


@lru_cache(maxsize=1)
def _firestore_state_store():
    return FirestoreStateStore()


def read_state_snapshot(key):
    return _firestore_state_store().read(key)


def write_state_snapshot(key, value):
    return _firestore_state_store().write(key, value)


def store_partner_share(influencer_id, token_hash, created_at, revoke_existing=True):
    client = _firestore_client()
    shares = client.collection("partnerShares")
    if revoke_existing:
        query = shares.where("influencerId", "==", int(influencer_id))
        batch = client.batch()
        pending = 0
        for snapshot in query.stream():
            if (snapshot.to_dict() or {}).get("revokedAt") is not None:
                continue
            batch.update(snapshot.reference, {"revokedAt": created_at})
            pending += 1
            if pending >= 400:
                batch.commit()
                batch = client.batch()
                pending = 0
        if pending:
            batch.commit()
    ref = shares.document(str(token_hash))
    ref.set({
        "influencerId": int(influencer_id),
        "tokenHash": str(token_hash),
        "createdAt": str(created_at),
        "expiresAt": int((datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) + timedelta(days=30)).timestamp()),
        "revokedAt": None,
    })
    return {"id": str(token_hash), "influencer_id": int(influencer_id), "revoked_at": None}


def lookup_partner_share(token_hash):
    snapshot = _firestore_client().collection("partnerShares").document(str(token_hash)).get()
    if not snapshot.exists:
        return None
    value = snapshot.to_dict() or {}
    created_at = value.get("createdAt")
    expires_at = value.get("expiresAt")
    if expires_at is None and created_at:
        try:
            expires_at = (datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) + timedelta(days=30)).timestamp()
        except (ValueError, TypeError):
            expires_at = 0
    if expires_at and float(expires_at) <= time.time():
        return {
            "id": snapshot.id,
            "influencer_id": value.get("influencerId"),
            "revoked_at": "expired",
            "created_at": created_at,
        }
    return {
        "id": snapshot.id,
        "influencer_id": value.get("influencerId"),
        "revoked_at": value.get("revokedAt"),
        "created_at": created_at,
    }


def revoke_partner_share(share_id, revoked_at):
    ref = _firestore_client().collection("partnerShares").document(str(share_id))
    if not ref.get().exists:
        return False
    ref.update({"revokedAt": str(revoked_at)})
    return True


def revoke_partner_shares_for_influencer(influencer_id, revoked_at):
    client = _firestore_client()
    query = client.collection("partnerShares").where("influencerId", "==", int(influencer_id))
    count = 0
    batch = client.batch()
    pending = 0
    for snapshot in query.stream():
        if (snapshot.to_dict() or {}).get("revokedAt") is not None:
            continue
        batch.update(snapshot.reference, {"revokedAt": str(revoked_at)})
        pending += 1
        count += 1
        if pending >= 400:
            batch.commit()
            batch = client.batch()
            pending = 0
    if pending:
        batch.commit()
    return count


def verify_admin_token(token):
    claims = verify_clerk_token(token)
    allowed_subjects = {
        value.strip().lower()
        for value in str(os.environ.get("CLERK_ADMIN_USER_IDS") or "").split(",")
        if value.strip()
    }
    if not allowed_subjects:
        raise FirebaseTokenInvalid("IRM administrator access is not configured.")
    subject = str(claims.get("sub") or "").strip().lower()
    email = str(claims.get("email") or claims.get("primary_email") or "").strip().lower()
    email_is_verified = claims.get("email_verified") is True
    if not email:
        try:
            from server import clerk_user_for_claims
            user = clerk_user_for_claims(claims)
            email = str(user.get("email") or "").strip().lower()
            email_is_verified = bool(email)
        except Exception:
            pass
    if subject not in allowed_subjects and not (email_is_verified and email in allowed_subjects):
        raise FirebaseTokenInvalid("This account is not authorized for IRM administration.")
    return claims
