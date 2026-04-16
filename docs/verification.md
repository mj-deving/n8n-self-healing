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

## Repository Alignment

The committed workflow source files carry the live workflow IDs and active state, and the public caller workflows propagate payload-supplied runtime configuration into the self-healer request path.
