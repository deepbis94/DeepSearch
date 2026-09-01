#!/usr/bin/env bash
# Example: submit a research job and poll until complete.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
QUESTION="${1:-What are the latest PHP 8.4 deprecations?}"

echo "Submitting: $QUESTION"
RESP=$(curl -sS -X POST "$BASE_URL/api/research" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg q "$QUESTION" '{question:$q}')")

JOB_ID=$(echo "$RESP" | jq -r '.id')
if [[ -z "$JOB_ID" || "$JOB_ID" == "null" ]]; then
  echo "Failed to create job:"
  echo "$RESP" | jq .
  exit 1
fi

echo "Job ID: $JOB_ID"
echo "Polling..."

for _ in $(seq 1 120); do
  STATUS_JSON=$(curl -sS "$BASE_URL/api/research/$JOB_ID")
  STATUS=$(echo "$STATUS_JSON" | jq -r '.status')
  echo "  status=$STATUS"
  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
    echo "$STATUS_JSON" | jq .
    exit 0
  fi
  sleep 3
done

echo "Timed out waiting for job $JOB_ID"
exit 1
