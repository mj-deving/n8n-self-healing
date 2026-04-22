# CLAUDE.md — n8n Self-Healing Workflow

## Before Any Work

- **Read `@AGENTS.md`** for session protocol (Beads task tracking, Landing the Plane, session completion rules)
- **Read `AGENTS.md`** for the n8nac workflow protocol (GitOps sync, research, validation, testing, error classification)
  - If `AGENTS.md` says "run n8nac init", do that first — it auto-generates the full protocol
- **Run `bd prime`** at session start to recover current issue-tracker context

## Project Overview

Self-healing n8n workflow that detects failures, uses an OpenRouter-backed model call to diagnose the root cause, applies a fix strategy, retries, and logs the outcome. Demonstrates the "Self-Healing" pattern from the Agentic Workflows paradigm.

**Architecture:**
```
Primary Workflow (API Data Sync)
  → on error → Error Handler
    → Healer Sub-Workflow
      1. Capture error context (node, message, input data)
      2. AI Diagnosis (OpenRouter via HTTP Request)
      3. Select fix strategy (backoff, retry, fallback, escalate)
      4. Apply fix + retry original operation
      5. Log outcome to workflow static data
      6. Notify via Slack (healed=green, escalated=red)
```

**Error Simulator** — separate workflow that intentionally triggers each error type for demo/testing.

## Tech Stack

- **n8n 2.x** — workflow automation (connect via `npm run setup:n8n -- <host>`)
- **n8nac** — code-first workflow development (`.workflow.ts` format)
- **OpenRouter** — AI-powered error diagnosis via HTTP Request node
- **Slack** — notifications (healed / escalated)
- **Beads** (`bd`) — AI-native issue tracker

## n8n Instance

- **URL**: `http://172.31.224.1:5678` (WSL bridge)
- Use `npm run setup:n8n -- http://172.31.224.1:5678` after exporting `N8N_API_KEY`

## Key Commands

```bash
# First-time repo bootstrap
npm install
git config core.hooksPath .githooks
bd prime
export N8N_API_KEY="<your n8n API key>"
npm run setup:n8n -- http://172.31.224.1:5678
npm run validate:workflows

# n8nac operations
npm run setup:n8n -- <host>             # First-time setup — connect to n8n
npx --yes n8nac list                    # List all workflows
npx --yes n8nac push <full-path>.workflow.ts # Push workflow to n8n
npx --yes n8nac verify <id>            # Validate live workflow
npx --yes n8nac test <id> --prod       # Test webhook workflows

# Scaffold
npm run new-workflow -- <category>/<slug> "Display Name"

# Beads
bd prime              # Recover tracker context
bd ready              # Start session — find available work
bd dolt push          # Persist tracker state when network access is available
```

## Workflow Files

| File | Purpose |
|------|---------|
| `workflows/agents/self-healer/` | Healer sub-workflow (AI diagnosis + fix) |
| `workflows/utilities/error-simulator/` | Intentional error generator for testing |
| `workflows/pipelines/api-data-sync/` | Primary workflow that can fail |
| Workflow static data | Latest output snapshot, fallback history, and heal log |

## Error Types to Handle

| Error | Diagnosis | Fix Strategy |
|-------|-----------|-------------|
| HTTP 429 (Rate Limit) | "API rate limited" | Exponential backoff + retry |
| HTTP 500 (Server Error) | "Upstream server issue" | Wait 30s + retry (max 3x) |
| HTTP 401 (Auth expired) | "Authentication failed" | Escalate to Slack |
| JSON Parse Error | "Malformed response" | Fallback parser + log raw |
| Timeout | "Request too slow" | Increase timeout + retry |
| Schema Change | "Response structure changed" | AI-generated adapter |
| Output Write Fail | "Destination unavailable" | Store fallback payload in static data + retry later |

## Critical Rules

- **Push full path**: `npx --yes n8nac push /absolute/or/workspace-relative/path/to/workflow.ts`
- **Init required**: Must export `N8N_API_KEY` and run `npm run setup:n8n -- <host>` before pull/push
- **Session end**: Follow the Beads close protocol and use `bd dolt push` when remote access is available
- **Never leave unpushed work** — work isn't done until `git push` succeeds


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
