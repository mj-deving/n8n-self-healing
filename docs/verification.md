# Verification

This page holds operational evidence and live-instance details that are intentionally kept out of the consumer-facing `README.md`.

## Live Workflow IDs

- `API Data Sync`: `jBbMvA2RK39YlEM9`
- `Self-Healer`: `85XCB5Us5UVyu3Da`
- `Error Generator`: `rWAEEC4nCqojdRtu`

## Verified Instance

- host: `http://172.31.224.1:5678`
- verification date: April 16, 2026

## Runtime Constraint

This n8n instance blocks `$env` access inside node expressions. Runtime secrets must therefore be passed through payload fields and sub-workflow inputs rather than read directly from environment variables inside node expressions.

Relevant payload fields:

- `openrouter_api_key`
- `openrouter_model`
- `slack_webhook_url`
- `self_healer_webhook_url`

## Verification Evidence

- OpenRouter production test succeeded in the verified working session on April 16, 2026.
- Execution `1871` confirmed `diagnosis_source=openrouter`.
- The same execution confirmed `fix_strategy=escalate`.
- `Send Escalation Alert` succeeded.
- Slack returned `{"data":"ok"}`.

## Fresh Live Checks

Happy path recheck from the primary workflow:

- `POST /webhook/api-data-sync` with `{"max_items":2}` returned `status=success`
- response confirmed `records_synced=2`
- storage backend reported `workflow_static_data`

Six-scenario simulator pass on April 16, 2026:

| Scenario | Result | Strategy | Outcome |
|---|---|---|---|
| `429` | healed | `backoff` | healed |
| `500` | healed | `retry` | healed |
| `401` | escalated | `escalate` | escalated |
| `parse` | healed | `fallback` | healed |
| `timeout` | healed | `backoff` | healed |
| `schema` | healed | `fallback` | healed |

Notes:

- The simulator run used a present `OPENROUTER_API_KEY` in the shell, so model-backed diagnosis was available during this pass.
- `SLACK_WEBHOOK_URL` was not present in the current shell during the six-scenario rerun, so the fresh simulator pass confirms routing and outcomes but not live Slack delivery for that specific rerun.
- Live Slack delivery was already confirmed separately by execution `1871`.

## Post-Merge Sanity Check From `main`

Re-run completed from the merged `main` branch on April 16, 2026:

- `npx --yes n8nac verify jBbMvA2RK39YlEM9` passed
- `npx --yes n8nac verify 85XCB5Us5UVyu3Da` passed
- `npx --yes n8nac verify rWAEEC4nCqojdRtu` passed
- `POST /webhook/api-data-sync` with `{"max_items":2}` returned `status=success`, `records_synced=2`, and `storage_backend=workflow_static_data`
- `npm run demo:errors` rechecked all six scenarios from `main`

Scenario results from the post-merge rerun:

| Scenario | Result | Strategy | Outcome |
|---|---|---|---|
| `429` | healed | `backoff` | healed |
| `500` | healed | `retry` | healed |
| `401` | escalated | `escalate` | escalated |
| `parse` | healed | `fallback` | healed |
| `timeout` | healed | `backoff` | healed |
| `schema` | healed | `fallback` | healed |

Environment note for this rerun:

- `OPENROUTER_API_KEY` was present, so model-backed diagnosis was available.
- `SLACK_WEBHOOK_URL` was absent, so this rerun does not add a new live Slack-delivery confirmation.

## Repository Alignment

The committed workflow source files carry the live workflow IDs and active state, and the public caller workflows propagate payload-supplied runtime configuration into the self-healer request path.
