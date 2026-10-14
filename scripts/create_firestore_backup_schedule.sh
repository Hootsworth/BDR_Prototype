#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID=bdrcreek
DATABASE_ID='(default)'
RETENTION=4w

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Google Cloud CLI (gcloud) is required to create Firestore managed backup schedules." >&2
  exit 1
fi

gcloud firestore backups schedules create \
  --project="$PROJECT_ID" \
  --database="$DATABASE_ID" \
  --recurrence=daily \
  --retention="$RETENTION"
