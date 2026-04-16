---
summary: Session kickoff for v2 upgrade — code-mode integration, learning loop, parallel enrichment, monitoring workflow, execution inspection
read_when: upgrading self-healing project, adding code-mode, next iteration
---

# Self-Healing v2 Upgrade — Session Kickoff

> Copy everything below the line into a fresh session at `~/projects/n8n-self-healing`.
> Original builder was **Codex**. This upgrade can be done by Claude Code or Codex.

---

## Overview

The self-healing project (v1) is production-shaped and live-verified with 3 workflows (API Data Sync, Self-Healer, Error Simulator). v2 adds **code-mode integration**, a **learning loop**, **parallel enrichment**, a **monitoring workflow**, and **n8n execution inspection** for richer diagnosis.

**Goal:** Demonstrate that code-mode dramatically simplifies the Self-Healer by collapsing 5 diagnosis nodes into 1, while adding capabilities that weren't feasible with the sequential node approach.

## Current Project State

- **Repo:** `~/projects/n8n-self-healing` — GitHub: `mj-deving/n8n-self-healing`
- **n8nac:** Initialized. workflowDir: `/home/mj/projects/n8n-self-healing/172_31_224_1:5678_marius _j/personal/`
- **Beads:** Active. Run `bd prime` at session start.
- **n8n host:** `http://172.31.224.1:5678` — env vars `$N8N_HOST` and `$N8N_API_KEY` in `~/.bashrc`
- **Tests:** `npm test` runs contract tests (node:test)
- **All 3 workflows live and verified** (April 16, 2026)

### Live Workflow IDs

| Workflow | ID | Webhook |
|---|---|---|
| API Data Sync | `jBbMvA2RK39YlEM9` | `POST /webhook/api-data-sync` |
| Self-Healer | `85XCB5Us5UVyu3Da` | `POST /webhook/self-healer` |
| Error Generator | `rWAEEC4nCqojdRtu` | `POST /webhook/simulate-error` |

### Key Constraint

This n8n instance **blocks `$env` access** inside node expressions. Runtime secrets (OpenRouter API key, Slack webhook URL) are passed via payload fields, not environment variables.

## The 5 Upgrades (Priority Order)

---

### Upgrade 1: Code-Mode Integration (collapse 5 nodes → 1)

**Current state (Self-Healer nodes 4-8):**
```
PrepareModelRequest → RouteDiagnosisMode → OpenRouterDiagnosis → ExtractModelDiagnosis → MockDiagnosis
```
5 separate nodes: prepare prompt, check if API key present, call OpenRouter, parse JSON response, fall back to deterministic matrix. Each node passes data via n8n expressions.

**Target state:**
Replace all 5 with a single **Code-Mode Tool** (or toolCode node) that:

```javascript
// Inside code-mode sandbox or toolCode:
const ctx = $json; // normalized error input

// 1. Check heal history first (Upgrade 2 prereq)
const staticData = $getWorkflowStaticData('global');
const healLog = staticData.healLog || [];
const historicalMatch = healLog.filter(e => e.error_type === ctx.error_type && e.outcome === 'healed').slice(-5);

// 2. If we have a reliable historical pattern, skip LLM
if (historicalMatch.length >= 3) {
  const dominant = historicalMatch[historicalMatch.length - 1];
  return {
    json: {
      ...ctx,
      diagnosis_source: 'historical',
      diagnosis: `Previously healed ${historicalMatch.length} times with ${dominant.fix_strategy}`,
      fix_strategy: dominant.fix_strategy,
      wait_seconds: dominant.total_heal_time_ms ? dominant.total_heal_time_ms / 1000 : 0,
      details: `Skipped LLM — historical success rate for ${ctx.error_type}: ${historicalMatch.length}/5`
    }
  };
}

// 3. Try OpenRouter diagnosis (if API key present)
let diagnosis;
if (ctx.openrouter_api_key) {
  try {
    const response = await $helpers.httpRequest({
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${ctx.openrouter_api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: ctx.openrouter_model || 'anthropic/claude-haiku-4-5',
        max_tokens: 256,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are an n8n workflow error diagnostician. Respond with JSON: { "diagnosis": string, "fix_strategy": "retry"|"backoff"|"fallback"|"escalate", "wait_seconds": number, "details": string }.' },
          { role: 'user', content: JSON.stringify({ error_type: ctx.error_type, error_message: ctx.error_message, node_name: ctx.node_name, workflow_name: ctx.workflow_name }) }
        ]
      })
    });
    const content = response.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    diagnosis = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    diagnosis.diagnosis_source = 'openrouter';
  } catch (e) {
    // Fall through to deterministic
  }
}

// 4. Deterministic fallback matrix (same as current MockDiagnosis)
if (!diagnosis) {
  const matrix = {
    '429': { diagnosis: 'API rate limited', fix_strategy: 'backoff', wait_seconds: 30 },
    '500': { diagnosis: 'Upstream server error', fix_strategy: 'retry', wait_seconds: 0 },
    '401': { diagnosis: 'Auth failed', fix_strategy: 'escalate', wait_seconds: 0 },
    'parse': { diagnosis: 'Malformed payload', fix_strategy: 'fallback', wait_seconds: 0 },
    'timeout': { diagnosis: 'Request timeout', fix_strategy: 'backoff', wait_seconds: 15 },
    'schema': { diagnosis: 'Schema changed', fix_strategy: 'fallback', wait_seconds: 0 }
  };
  diagnosis = matrix[ctx.error_type] || { diagnosis: 'Unknown', fix_strategy: 'escalate', wait_seconds: 0 };
  diagnosis.diagnosis_source = 'deterministic';
}

return {
  json: {
    ...ctx,
    diagnosis_source: diagnosis.diagnosis_source,
    diagnosis: diagnosis.diagnosis,
    fix_strategy: diagnosis.fix_strategy,
    wait_seconds: Number(diagnosis.wait_seconds || 0),
    details: diagnosis.details || diagnosis.diagnosis
  }
};
```

**Implementation steps:**
1. Read `workflows/agents/self-healer/workflow/workflow.ts`
2. Replace nodes `PrepareModelRequest`, `RouteDiagnosisMode`, `OpenRouterDiagnosis`, `ExtractModelDiagnosis`, `MockDiagnosis` with a single Code node
3. Update the `@links()` section: `NormalizeErrorInput.out(0)` → new diagnosis node → `RouteFixStrategy.in(0)`
4. Use `this.helpers.httpRequest()` for the OpenRouter call (sandbox rule — no fetch)
5. Push: `npx --yes n8nac push workflows/agents/self-healer/workflow/workflow.ts --verify`
6. Test: `npx --yes n8nac workflow activate 85XCB5Us5UVyu3Da && npx --yes n8nac test 85XCB5Us5UVyu3Da --prod`
7. Update contract tests in `tests/workflow-contracts.test.js`

**Before/after metric:** 17 nodes → 13 nodes. 5 diagnosis nodes → 1. Same behavior, fewer moving parts.

---

### Upgrade 2: Learning Loop (historical heal log informs future decisions)

**Current state:** `WriteHealLog` stores outcomes in `$getWorkflowStaticData('global').healLog` but **never reads them for decisions**.

**Target state:** The diagnosis code (from Upgrade 1) checks heal history BEFORE calling the LLM:
- If the same `error_type` was healed 3+ times recently with the same strategy → use that strategy directly, skip LLM
- Track success rate per strategy per error type
- Log `diagnosis_source: 'historical'` so monitoring can distinguish

**This is already included in the Upgrade 1 code above** (the `historicalMatch` check). The additional work is:
1. Add a `successRate` calculation per error_type in `WriteHealLog`
2. Add a contract test that verifies the heal log is read during diagnosis
3. Test scenario: run `simulate-error` with type `429` three times → fourth time should show `diagnosis_source: historical`

---

### Upgrade 3: Parallel Health Checks

**Current state:** Diagnosis uses only one source — either OpenRouter or the deterministic matrix.

**Target state:** Before choosing a strategy, gather context from multiple sources in parallel:

```javascript
// Inside the diagnosis code node:
const [healHistory, upstreamHealth, executionData] = await Promise.all([
  // 1. Historical heal log (local — already in static data)
  Promise.resolve(staticData.healLog?.filter(e => e.error_type === ctx.error_type) || []),
  
  // 2. Upstream health check (is the dependency actually reachable?)
  ctx.retry_target_url ? $helpers.httpRequest({
    method: 'HEAD',
    url: ctx.retry_target_url,
    timeout: 5000
  }).then(() => ({ reachable: true })).catch(() => ({ reachable: false })) : Promise.resolve({ reachable: 'unknown' }),
  
  // 3. n8n execution data (if execution ID is available)
  ctx.execution_id ? $helpers.httpRequest({
    method: 'GET',
    url: `http://172.31.224.1:5678/api/v1/executions/${ctx.execution_id}`,
    headers: { 'X-N8N-API-KEY': ctx.n8n_api_key || '' }
  }).then(r => r).catch(() => null) : Promise.resolve(null)
]);
```

**Implementation:**
1. Extend the diagnosis Code node from Upgrade 1 with parallel checks
2. Pass the combined context to OpenRouter for richer diagnosis
3. Add `upstream_reachable` to the heal log
4. If upstream is already reachable when we get a 500 → probably transient, increase retry confidence

**Note:** `Promise.all` works in n8n Code nodes. The sandbox supports async/await.

---

### Upgrade 4: Monitoring Workflow

**Current state:** `docs/monitoring.md` describes what to monitor but nothing is automated.

**Target state:** New workflow `workflows/utilities/monitor/` that:

```
Schedule (every 15 min) → Query n8n Executions API → Aggregate heal outcomes → Check thresholds → Alert
```

**Architecture:**
1. **Schedule Trigger** — every 15 minutes
2. **Code Node** — query `GET /api/v1/executions?workflowId=85XCB5Us5UVyu3Da&limit=50` via `this.helpers.httpRequest` with `X-N8N-API-KEY` header
3. **Code Node** — aggregate: count healed vs escalated in last 30 min, check thresholds from `docs/monitoring.md`:
   - 3+ escalations in 30 min → high-priority alert
   - 5+ healed failures in 30 min → warning
   - `fallback` dominant for 1+ hour → warning
4. **Switch** — route by severity
5. **Slack/Telegram** — send alert

**Implementation:**
```bash
npm run new-workflow -- utilities/monitor "Self-Healing Monitor"
```

Write the workflow.ts, push, verify, test. The monitoring thresholds come directly from `docs/monitoring.md` (lines 65-79).

**Critical:** The n8n API call uses `this.helpers.httpRequest` with `X-N8N-API-KEY` header (NOT `Authorization: Bearer`). The API key must be passed in the payload or read from static data (remember: no `$env` access).

---

### Upgrade 5: n8n Execution Inspection for Diagnosis

**Current state:** The healer diagnoses based only on the error payload forwarded by the caller. It doesn't know what the actual execution looked like.

**Target state:** When the Self-Healer receives an error, it also pulls the **last execution** of the failing workflow from the n8n API and includes it in the diagnosis context.

**Implementation:**
1. Add `execution_id` and `n8n_api_key` as optional fields to the healer webhook inputs
2. In the API Data Sync error handler, capture `$execution.id` and forward it
3. In the diagnosis Code node, if `execution_id` is present:
   ```javascript
   const execData = await $helpers.httpRequest({
     method: 'GET',
     url: `http://172.31.224.1:5678/api/v1/executions/${ctx.execution_id}?includeData=true`,
     headers: { 'X-N8N-API-KEY': ctx.n8n_api_key }
   });
   // Extract: which node failed, what was the input, what was the error
   const failedNode = execData.data?.resultData?.error?.node;
   const errorMessage = execData.data?.resultData?.error?.message;
   ```
4. Feed this richer context to the OpenRouter prompt for better diagnosis

**API reference:**
```bash
# List recent executions for self-healer
npx --yes n8nac execution list --workflow-id 85XCB5Us5UVyu3Da --limit 5 --json

# Get full execution with data
npx --yes n8nac execution get <executionId> --include-data --json
```

---

## Sandbox Rules (MUST follow)

- **No `require('fs')`** — blocked
- **No `fetch()`** — not available
- **Only `this.helpers.httpRequest()`** for HTTP calls (in Code nodes use `$helpers.httpRequest`)
- **`$getWorkflowStaticData('global')`** for persistence
- **No `$env` access** on this instance — pass secrets via payload

## n8nac Commands

```bash
# Push workflow (always full path)
npx --yes n8nac push workflows/agents/self-healer/workflow/workflow.ts --verify
npx --yes n8nac push workflows/pipelines/api-data-sync/workflow/workflow.ts --verify
npx --yes n8nac push workflows/utilities/error-simulator/workflow/workflow.ts --verify

# Test
npx --yes n8nac workflow activate <id>
npx --yes n8nac test <id> --prod

# Verify
npx --yes n8nac verify <id>

# Quality gates
npm test
npm run validate:workflows
```

## n8n Credentials

| Credential | ID | Type |
|---|---|---|
| OpenRouter | `mOL6UoYXfgKf6RZh` | openAiApi |
| Google Gemini | `FVE8T8mYCgIRpSyv` | googlePalmApi |
| Telegram Bot | `nzmbw9ZNGZdA9sZp` | telegramApi |

## Test Scenarios for Verification

After each upgrade, re-run the full simulator suite:

```bash
export N8N_BASE_URL="http://172.31.224.1:5678"
npm run demo:errors
```

Plus new test cases:

| Upgrade | Test | Expected |
|---|---|---|
| 1 | Run `simulate-error` with `429` + API key | `diagnosis_source: openrouter`, strategy: `backoff` |
| 1 | Run `simulate-error` with `429` without API key | `diagnosis_source: deterministic`, strategy: `backoff` |
| 2 | Run `429` three times, then a fourth | Fourth should show `diagnosis_source: historical` |
| 3 | Run `500` when upstream is reachable | Diagnosis includes `upstream_reachable: true` |
| 4 | Wait 15 min after simulator suite | Monitor workflow fires, no alert (below thresholds) |
| 5 | Run with `execution_id` in payload | Diagnosis includes execution trace context |

## Success Criteria

- [ ] Self-Healer has 13 nodes (down from 17) — 5 diagnosis nodes collapsed to 1
- [ ] All 6 simulator scenarios still pass with identical outcomes
- [ ] New `diagnosis_source: historical` appears after 3+ identical errors
- [ ] Parallel upstream health check works (add `upstream_reachable` to heal log)
- [ ] Monitor workflow runs on schedule and queries execution API
- [ ] Execution inspection enriches diagnosis when `execution_id` is provided
- [ ] Contract tests updated and passing (`npm test`)
- [ ] All workflows pushed, verified, and live-tested

## Execution Order

Do upgrades sequentially — each builds on the previous:

1. **Upgrade 1** first (code-mode integration) — this restructures the core diagnosis flow
2. **Upgrade 2** next (learning loop) — extends the diagnosis code from Upgrade 1
3. **Upgrade 3** (parallel checks) — extends the diagnosis code further
4. **Upgrade 4** (monitoring) — independent workflow, can be done in parallel with 3
5. **Upgrade 5** (execution inspection) — requires payload changes in API Data Sync + Self-Healer

## Start Commands

```bash
cd ~/projects/n8n-self-healing
bd prime
npm test  # verify green baseline
npx --yes n8nac list  # verify connection
```

Read CLAUDE.md and AGENTS.md, then start with Upgrade 1.
