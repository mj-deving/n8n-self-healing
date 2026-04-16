#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${N8N_BASE_URL:-http://172.31.224.1:5678}}"
WEBHOOK_URL="${BASE_URL%/}/webhook/simulate-error"
ERROR_TYPES=("429" "500" "401" "parse" "timeout" "schema")

echo "| error_type | result |"
echo "|---|---|"

for error_type in "${ERROR_TYPES[@]}"; do
    response="$(curl -sS -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"error_type\":\"${error_type}\"}" || true)"

    if [ -z "$response" ]; then
        response="request failed"
    fi

    compact_response="$(echo "$response" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/|/\\|/g')"
    echo "| ${error_type} | ${compact_response} |"
done
