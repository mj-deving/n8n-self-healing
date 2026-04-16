#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${N8N_BASE_URL:-http://172.31.224.1:5678}}"
WEBHOOK_URL="${BASE_URL%/}/webhook/simulate-error"
ERROR_TYPES=("429" "500" "401" "parse" "timeout" "schema")

echo "| error_type | result |"
echo "|---|---|"

for error_type in "${ERROR_TYPES[@]}"; do
    payload="$(jq -nc \
        --arg error_type "$error_type" \
        --arg openrouter_api_key "${OPENROUTER_API_KEY:-}" \
        --arg openrouter_model "${OPENROUTER_MODEL:-}" \
        --arg slack_webhook_url "${SLACK_WEBHOOK_URL:-}" \
        --arg self_healer_webhook_url "${SELF_HEALER_WEBHOOK_URL:-}" \
        '{
          error_type: $error_type,
          openrouter_api_key: $openrouter_api_key,
          openrouter_model: $openrouter_model,
          slack_webhook_url: $slack_webhook_url,
          self_healer_webhook_url: $self_healer_webhook_url
        }')"

    response="$(curl -sS -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$payload" || true)"

    if [ -z "$response" ]; then
        response="request failed"
    fi

    compact_response="$(echo "$response" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/|/\\|/g')"
    echo "| ${error_type} | ${compact_response} |"
done
