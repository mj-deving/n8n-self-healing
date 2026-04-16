# Self-Healer

Sub-workflow that receives a structured error payload, diagnoses the failure, selects a fix strategy, retries or falls back when possible, records a heal log entry in workflow static data, and sends notifications via a Slack webhook URL.

## Triggering

- `Execute Workflow Trigger` for sub-workflow reuse inside n8n
- `Webhook` for direct HTTP invocation

Webhook endpoint after push:

```bash
POST /webhook/self-healer
```

## Expected input

```json
{
  "error_type": "429",
  "error_message": "Rate limit exceeded",
  "node_name": "Fetch Source Posts",
  "workflow_name": "API Data Sync",
  "input_data": {},
  "retry_target_url": "https://httpstat.us/200",
  "retry_method": "GET",
  "timestamp": "2026-04-14T00:00:00.000Z"
}
```

## Strategies

- `retry`
- `backoff`
- `fallback`
- `escalate`

## Runtime notes

- Uses live model diagnosis when `openrouter_api_key` is provided in the input payload
- Accepts `openrouter_api_key`, `openrouter_model`, and `slack_webhook_url` in the input payload
- Uses deterministic mock diagnosis when the API key is absent
- Appends logs to workflow static data (`healLog`)
- Uses `slack_webhook_url` from the input payload, otherwise notification nodes degrade safely
