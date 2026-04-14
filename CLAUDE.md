# CLAUDE.md — n8n Self-Healing Workflow

## Before Any Work

- **Read `@AGENTS.md`** for session protocol (Beads task tracking, Landing the Plane, session completion rules)
- **Read `AGENTS.md`** for the n8nac workflow protocol (GitOps sync, research, validation, testing, error classification)
  - If `AGENTS.md` says "run n8nac init", do that first — it auto-generates the full protocol

## Project Overview

Self-healing n8n workflow that detects failures, uses Claude AI to diagnose the root cause, applies a fix strategy, retries, and logs the outcome. Demonstrates the "Self-Healing" pattern from the Agentic Workflows paradigm.

**Architecture:**
```
Primary Workflow (API Data Sync)
  → on error → Error Handler
    → Healer Sub-Workflow
      1. Capture error context (node, message, input data)
      2. AI Diagnosis (Claude via HTTP Request)
      3. Select fix strategy (backoff, retry, fallback, escalate)
      4. Apply fix + retry original operation
      5. Log outcome to data/heal-log.json
      6. Notify via Slack (healed=green, escalated=red)
```

**Error Simulator** — separate workflow that intentionally triggers each error type for demo/testing.

## Tech Stack

- **n8n 2.x** — workflow automation (connect via `npx --yes n8nac init`)
- **n8nac** — code-first workflow development (`.workflow.ts` format)
- **Claude** — AI-powered error diagnosis via HTTP Request node (Anthropic API)
- **Slack** — notifications (healed / escalated)
- **Beads** (`bd`) — AI-native issue tracker

## n8n Instance

- **URL**: `http://172.31.224.1:5678` (WSL bridge)
- Run `npx --yes n8nac init` to connect

## Key Commands

```bash
# n8nac operations
npx --yes n8nac init                    # First-time setup — connect to n8n
npx --yes n8nac list                    # List all workflows
npx --yes n8nac push <file>.workflow.ts # Push workflow to n8n
npx --yes n8nac verify <id>            # Validate live workflow
npx --yes n8nac test <id> --prod       # Test webhook workflows

# Scaffold
npm run new-workflow -- <category>/<slug> "Display Name"

# Beads
bd ready              # Start session — find available work
bd sync               # End session — persist state for next agent
```

## Workflow Files

| File | Purpose |
|------|---------|
| `workflows/agents/self-healer/` | Healer sub-workflow (AI diagnosis + fix) |
| `workflows/utilities/error-simulator/` | Intentional error generator for testing |
| `workflows/pipelines/api-data-sync/` | Primary workflow that can fail |
| `data/heal-log.json` | Healing attempt log (append-only) |

## Error Types to Handle

| Error | Diagnosis | Fix Strategy |
|-------|-----------|-------------|
| HTTP 429 (Rate Limit) | "API rate limited" | Exponential backoff + retry |
| HTTP 500 (Server Error) | "Upstream server issue" | Wait 30s + retry (max 3x) |
| HTTP 401 (Auth expired) | "Authentication failed" | Escalate to Slack |
| JSON Parse Error | "Malformed response" | Fallback parser + log raw |
| Timeout | "Request too slow" | Increase timeout + retry |
| Schema Change | "Response structure changed" | AI-generated adapter |
| Output Write Fail | "Destination unavailable" | Queue locally + retry later |

## Critical Rules

- **Push filename only**: `npx --yes n8nac push workflow.ts` — no paths
- **Init required**: Must run `npx --yes n8nac init` before pull/push
- **Session end**: Always run `bd sync` then `git push` — Landing the Plane protocol
- **Never leave unpushed work** — work isn't done until `git push` succeeds
