# Self-Healing n8n Workflow

Production-shaped n8n workflow set for detecting failures, diagnosing them through OpenRouter, applying a recovery strategy, and emitting Slack escalation or healed notifications.

Status: WF17 is implemented, pushed, and live-verified. Tracked workflow IDs, live checks, and dated verification evidence live in [docs/verification.md](docs/verification.md). Production-polish monitoring guidance lives in [docs/monitoring.md](docs/monitoring.md).

Operators maintaining the live workflows should use [docs/runbook.md](docs/runbook.md) for the verification sequence, failure classification, and common troubleshooting steps.

## What The Project Does

- `API Data Sync` fetches remote data, transforms it, stores the latest output snapshot in workflow static data, and forwards failures to the self-healer.
- `Self-Healer` accepts structured error payloads, chooses between OpenRouter diagnosis and deterministic fallback logic, retries/backoffs/falls back/escalates, writes a heal log to workflow static data, and posts Slack-style alerts.
- `Error Generator` gives you a safe way to trigger known failure classes and verify the healing loop end to end.

## Runtime Model

This n8n instance blocks `$env` access inside node expressions. Because of that, runtime secrets and override values are payload-driven.

The public webhook entrypoints accept and forward these fields:

- `openrouter_api_key`
- `openrouter_model` (optional override)
- `slack_webhook_url`
- `self_healer_webhook_url` (optional override for callers; defaults to the local healer webhook)

That means you can test the complete flow through `api-data-sync` or `simulate-error` without baking secrets into the workflow definition.

## Repository Layout

- `workflows/pipelines/api-data-sync/` primary workflow package
- `workflows/agents/self-healer/` healer workflow package
- `workflows/utilities/error-simulator/` simulator workflow package
- `template/` scaffold source used by `npm run new-workflow`
- `workflow/` single-workflow export placeholder retained for distribution tooling
- `scripts/init-n8n.sh` non-interactive `n8nac` bootstrap helper
- `scripts/validate-workflows.sh` credential-free local validation lane
- `scripts/demo-all-errors.sh` quick simulator driver
- `data/output.json` and `data/heal-log.json` example seed artifacts for local docs

## Bootstrap

```bash
npm install
git config core.hooksPath .githooks
bd prime

export N8N_API_KEY="<your n8n API key>"
npm run setup:n8n -- http://172.31.224.1:5678

npm run validate:workflows
npm run validate
```

## Local Quality Gates

```bash
npm run validate:workflows
npm run validate
npm run check-secrets
```

## Push To n8n

`workflow.ts` is the source of truth for every workflow package.

```bash
npx --yes n8nac push /home/mj/projects/n8n-self-healing/workflows/agents/self-healer/workflow/workflow.ts --verify
npx --yes n8nac push /home/mj/projects/n8n-self-healing/workflows/pipelines/api-data-sync/workflow/workflow.ts --verify
npx --yes n8nac push /home/mj/projects/n8n-self-healing/workflows/utilities/error-simulator/workflow/workflow.ts --verify
```

## Webhook Endpoints

- `POST /webhook/api-data-sync`
- `POST /webhook/self-healer`
- `POST /webhook/simulate-error`

## Example Requests

### Successful Sync

```bash
curl -X POST http://172.31.224.1:5678/webhook/api-data-sync \
  -H "Content-Type: application/json" \
  -d '{
    "max_items": 5
  }'
```

Expected result:

- records are transformed
- the latest snapshot is written to workflow static data
- the response reports `status=success`

### Force A Healed Failure Path Through API Data Sync

```bash
curl -X POST http://172.31.224.1:5678/webhook/api-data-sync \
  -H "Content-Type: application/json" \
  -d '{
    "force_write_error": true,
    "openrouter_api_key": "'"$OPENROUTER_API_KEY"'",
    "slack_webhook_url": "'"$SLACK_WEBHOOK_URL"'"
  }'
```

That request exercises the payload-driven credential path: the sync workflow raises a write failure, forwards the runtime values into the healer request, and the healer can use OpenRouter and Slack without relying on `$env`.

### Simulate A Known Failure Class

```bash
curl -X POST http://172.31.224.1:5678/webhook/simulate-error \
  -H "Content-Type: application/json" \
  -d '{
    "error_type": "401",
    "openrouter_api_key": "'"$OPENROUTER_API_KEY"'",
    "slack_webhook_url": "'"$SLACK_WEBHOOK_URL"'"
  }'
```

Supported `error_type` values:

- `429`
- `500`
- `401`
- `parse`
- `timeout`
- `schema`

To run all six scenarios in sequence:

```bash
export N8N_BASE_URL="http://172.31.224.1:5678"
npm run demo:errors
```

### Call The Healer Directly

```bash
curl -X POST http://172.31.224.1:5678/webhook/self-healer \
  -H "Content-Type: application/json" \
  -d '{
    "error_type": "401",
    "error_message": "Authentication failed",
    "node_name": "Fetch Source Posts",
    "workflow_name": "API Data Sync",
    "input_data": {"source_url": "https://jsonplaceholder.typicode.com/posts"},
    "retry_target_url": "",
    "retry_method": "GET",
    "openrouter_api_key": "'"$OPENROUTER_API_KEY"'",
    "slack_webhook_url": "'"$SLACK_WEBHOOK_URL"'"
  }'
```

## Expected Healing Strategies

| Error type | Expected strategy | Notes |
|---|---|---|
| `429` | `backoff` | waits before retrying a healthy probe URL |
| `500` | `retry` | immediate retry against a recovery URL |
| `401` | `escalate` | not safely recoverable without credential rotation |
| `parse` | `fallback` | emits a safe fallback payload |
| `timeout` | `backoff` | retries with a longer timeout target |
| `schema` | `fallback` | adapts the malformed shape to a stable structure |

## Current Status

- local validation passes with `npm run validate:workflows`
- all 3 workflow sources are pushed and verified in n8n
- happy-path sync and all 6 simulator scenarios have been rechecked live
- the public caller workflows propagate payload-supplied runtime credentials into the healer
- Beads issue tracking is initialized and `bd prime` restores repo context

## Acceptance

- [x] Primary workflow implemented
- [x] Self-healer implemented with OpenRouter diagnosis and deterministic fallback
- [x] Error simulator implemented with six failure classes
- [x] Runtime credential flow is payload-driven end to end
- [x] Workflows pushed and verified in n8n
- [x] Live healing scenarios tested and documented
- [x] README reflects stable setup and usage guidance
