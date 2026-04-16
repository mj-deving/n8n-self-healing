# Operator Runbook

This runbook is for maintaining and re-verifying the live WF17 self-healing workflow set after code changes, merges, or n8n-side drift.

## Scope

Tracked live workflows:

- `API Data Sync` (`jBbMvA2RK39YlEM9`)
- `Self-Healer` (`85XCB5Us5UVyu3Da`)
- `Error Generator` (`rWAEEC4nCqojdRtu`)

Authoritative live-instance evidence lives in [verification.md](verification.md).

## Local Bootstrap

```bash
npm install
git config core.hooksPath .githooks
bd prime

export N8N_API_KEY="<your n8n API key>"
npm run setup:n8n -- http://172.31.224.1:5678
```

Optional runtime inputs for live healing checks:

```bash
export OPENROUTER_API_KEY="<openrouter key>"
export SLACK_WEBHOOK_URL="<slack webhook>"
export OPENROUTER_MODEL="<optional model override>"
export SELF_HEALER_WEBHOOK_URL="http://172.31.224.1:5678/webhook/self-healer"
```

## Standard Verification Flow

Run these in order after workflow edits or after a merge to `main`.

### 1. Local quality gates

```bash
npm run validate:workflows
npm run validate
npm run check-secrets
```

### 2. Confirm local and remote workflow mapping

```bash
npx --yes n8nac list
```

Expected result:

- the three WF17 workflows show as `TRACKED`
- no OCC conflict is reported

### 3. Push with verification when workflow code changed

```bash
npx --yes n8nac push workflows/agents/self-healer/workflow/workflow.ts --verify
npx --yes n8nac push workflows/pipelines/api-data-sync/workflow/workflow.ts --verify
npx --yes n8nac push workflows/utilities/error-simulator/workflow/workflow.ts --verify
```

If code did not change and you only want a live sanity check, plain `verify` is enough:

```bash
npx --yes n8nac verify jBbMvA2RK39YlEM9
npx --yes n8nac verify 85XCB5Us5UVyu3Da
npx --yes n8nac verify rWAEEC4nCqojdRtu
```

### 4. Happy-path webhook check

```bash
curl -X POST http://172.31.224.1:5678/webhook/api-data-sync \
  -H "Content-Type: application/json" \
  -d '{"max_items":2}'
```

Expected result:

- `status=success`
- `records_synced=2`
- `storage_backend=workflow_static_data`

### 5. Full simulator sweep

```bash
export N8N_BASE_URL="http://172.31.224.1:5678"
npm run demo:errors
```

Expected behavior:

- `429` heals through `backoff`
- `500` heals through `retry`
- `401` escalates
- `parse` heals through `fallback`
- `timeout` heals through `backoff`
- `schema` heals through `fallback`

## Failure Classification

### Configuration gap

Typical examples:

- missing `N8N_API_KEY`
- missing `OPENROUTER_API_KEY`
- missing `SLACK_WEBHOOK_URL`
- unavailable model setting in the live instance

Action:

- do not edit workflow code first
- fix the missing runtime configuration or credential

### Runtime-state issue

Typical examples:

- test webhook not armed
- production webhook not registered yet
- the workflow was not activated after push

Action:

- verify activation and webhook registration in n8n
- do not assume the workflow definition itself is broken

### Wiring bug

Typical examples:

- bad expression
- missing propagated field
- invalid operation or node parameter
- unexpected runtime crash in a code node

Action:

- fix the `.workflow.ts` source
- rerun local validation
- push with `--verify`
- rerun the relevant webhook or simulator check

## Common Troubleshooting

### `bd dolt pull` fails with remote/branch wording

Check the embedded Dolt branch tracking in `.beads/embeddeddolt/n8n_self_healing`:

```bash
cd .beads/embeddeddolt/n8n_self_healing
dolt branch -vv
```

If `main` is missing `[origin/main]`, repair it:

```bash
dolt branch --set-upstream-to origin/main main
```

### `n8nac list` shows `EXIST_ONLY_REMOTELY` for the WF17 workflows

The workspace is pointing at the wrong sync folder or instance selection. Re-check:

```bash
npx --yes n8nac instance list --json
sed -n '1,240p' n8nac-config.json
```

### OpenRouter diagnosis is not used during a live rerun

Check whether `OPENROUTER_API_KEY` or the payload-supplied `openrouter_api_key` is present. This n8n instance does not allow `$env` inside node expressions, so payload-driven runtime config is required.

### Slack was not revalidated during a simulator pass

That usually means `SLACK_WEBHOOK_URL` was not present in the shell or request payload. The simulator can still prove routing and strategy outcomes without proving live Slack delivery.

## Escalation Artifacts To Capture

When a rerun fails unexpectedly, record:

- exact command used
- absolute date of the rerun
- workflow ID involved
- response payload or `n8nac verify` output
- whether `OPENROUTER_API_KEY` and `SLACK_WEBHOOK_URL` were present

Add the durable outcome to [verification.md](verification.md) if it materially updates the known live state.
