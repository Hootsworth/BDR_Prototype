#!/usr/bin/env python3
"""Generate firebase.json after the Firebase/Cloud Run region is chosen."""

import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main():
    region = (os.environ.get("FIREBASE_REGION") or "").strip()
    if not region:
        raise SystemExit("Set FIREBASE_REGION after choosing the permanent Firestore region.")
    config = {
        "hosting": {
            "public": "public",
            "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
            "cleanUrls": True,
            "rewrites": [
                {
                    "source": "/app-config.js",
                    "run": {"serviceId": "trusted-influence-api", "region": region},
                },
                {
                    "source": "/api/**",
                    "run": {"serviceId": "trusted-influence-api", "region": region},
                }
            ],
        },
        "firestore": {"rules": "firestore.rules"},
    }
    (ROOT / "firebase.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print(f"Generated firebase.json for Firebase Hosting → Cloud Run ({region}).")


if __name__ == "__main__":
    main()
