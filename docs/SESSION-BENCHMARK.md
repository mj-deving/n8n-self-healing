---
summary: Benchmark session — measure token savings of v2 collapsed diagnosis vs v1 5-node chain
read_when: benchmarking, measuring token savings, proving code-mode value
---

# Self-Healing v2 — Benchmark Session

> Measure the actual savings from collapsing the 5-node diagnosis chain into 1 code node, plus the learning loop that skips the LLM entirely.

---

## Goal

Produce a reproducible benchmark comparing:
- **v1 (5-node chain):** PrepareModelRequest → RouteDiagnosisMode → OpenRouterDiagnosis → ExtractModelDiagnosis → MockDiagnosis
- **v2 (collapsed):** Single diagnosis Code node with historical pattern matching + LLM fallback

Unique advantage: v2 has a **learning loop** — after 3+ identical errors, it skips the LLM entirely and uses historical patterns. This is a savings category that traditional n8n can't express.

## Current Architecture (v2)

Self-Healer has **25 nodes** (up from 17 in v1, due to added monitoring, parallel checks, and execution inspection). But the diagnosis chain went from 5 nodes → 1.

Key measurement: the diagnosis Code node handles 3 paths:
1. **Historical match** (no LLM call — fastest, cheapest)
2. **OpenRouter diagnosis** (1 LLM call)
3. **Deterministic fallback** (no LLM call)

## Benchmark Methodology

### Step 1: Measure v2 with Fresh Error (No History)

Clear the heal log first, then trigger a 429 error:

```bash
# Trigger fresh 429 — no historical pattern exists yet
curl -X POST http://172.31.224.1:5678/webhook/simulate-error \
  -H "Content-Type: application/json" \
  -d '{
    "error_type": "429",
    "openrouter_api_key": "'"$OPENROUTER_API_KEY"'",
    "slack_webhook_url": "'"$SLACK_WEBHOOK_URL"'"
  }'
```

Inspect execution:
```bash
npx --yes n8nac execution list --workflow-id 85XCB5Us5UVyu3Da --limit 1 --json
npx --yes n8nac execution get <execution-id> --include-data --json
```

Record:
- `diagnosis_source`: should be `openrouter` (first time, no history)
- LLM tokens used (from OpenRouter response metadata if available)
- Execution time
- Nodes that fired

### Step 2: Build Up History (3 identical errors)

Run the same 429 error 3 more times (4 total):

```bash
for i in 1 2 3; do
  curl -s -X POST http://172.31.224.1:5678/webhook/simulate-error \
    -H "Content-Type: application/json" \
    -d '{"error_type": "429", "openrouter_api_key": "'"$OPENROUTER_API_KEY"'"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Run {$i}: source={d.get(\"diagnosis_source\",\"?\")}, strategy={d.get(\"strategy\",\"?\")}')"
  sleep 2
done
```

### Step 3: Measure v2 with Historical Match

Now trigger the 5th 429 — this should hit the learning loop:

```bash
curl -X POST http://172.31.224.1:5678/webhook/simulate-error \
  -H "Content-Type: application/json" \
  -d '{"error_type": "429"}'
```

Record:
- `diagnosis_source`: should be `historical` (skipped LLM!)
- LLM tokens: **0** (no LLM call made)
- Execution time (should be faster — no HTTP call to OpenRouter)

### Step 4: Measure Without API Key (Deterministic Fallback)

```bash
curl -X POST http://172.31.224.1:5678/webhook/simulate-error \
  -H "Content-Type: application/json" \
  -d '{"error_type": "500"}'
```

Record:
- `diagnosis_source`: should be `deterministic`
- LLM tokens: **0**

### Step 5: Run All 6 Error Types and Collect Data

```bash
export N8N_BASE_URL="http://172.31.224.1:5678"
npm run demo:errors
```

For each of the 6 scenarios, record from execution data:
- diagnosis_source (historical / openrouter / deterministic)
- LLM tokens used (0 for non-LLM paths)
- Execution time
- Strategy chosen
- Outcome (healed / escalated)

### Step 6: Design the v1 Comparison

v1 had 5 diagnosis nodes in sequence. For each error:
- **PrepareModelRequest:** Code node, no LLM call
- **RouteDiagnosisMode:** Switch node, no LLM call
- **OpenRouterDiagnosis:** HTTP Request to OpenRouter (1 LLM call, ~500-1000 tokens)
- **ExtractModelDiagnosis:** Code node, no LLM call
- **MockDiagnosis:** Code node (only if OpenRouter unavailable)

v1 always made **1 LLM call per error** when API key was present, regardless of whether the same error had been seen before. No learning loop.

### Step 7: Calculate Savings

**Per-error comparison:**

| Scenario | v1 Nodes | v2 Nodes | v1 LLM Calls | v2 LLM Calls | v2 Source |
|---|---|---|---|---|---|
| First 429 (no history) | 5 | 1 | 1 | 1 | openrouter |
| Repeated 429 (with history) | 5 | 1 | 1 | **0** | historical |
| 500 without API key | 5 | 1 | 0 | 0 | deterministic |
| 401 with API key | 5 | 1 | 1 | 1 | openrouter |

**Learning loop impact at scale:**

If 70% of errors in production are repeats of known patterns:
- v1: 100 errors/day × 1 LLM call = 100 LLM calls/day
- v2: 100 errors/day × 30% new × 1 LLM call = **30 LLM calls/day** (70% saved by learning loop)

**Node reduction:**
- v1 diagnosis chain: 5 nodes
- v2 diagnosis: 1 node
- Reduction: 80%

### Step 8: Document

Write results to `benchmark.md` in the project root. Include:
- Test date, n8n version, LLM model
- Per-error-type measurements (source, tokens, time)
- Learning loop demonstration (fresh → repeated → historical match)
- v1 vs v2 node comparison
- Cost projection with 70% repeat rate
- Unique value: "learning loop eliminates LLM calls for known patterns"

## n8n Instance

- Host: `http://172.31.224.1:5678`
- Self-Healer ID: `85XCB5Us5UVyu3Da`
- Error Simulator ID: `rWAEEC4nCqojdRtu`
- API Data Sync ID: `jBbMvA2RK39YlEM9`

Read `CLAUDE.md` for credentials and sandbox rules.

## Success Criteria

- [ ] Fresh error measured (openrouter diagnosis, with tokens)
- [ ] Historical match demonstrated (5th identical error skips LLM)
- [ ] Deterministic fallback measured (no API key path)
- [ ] All 6 error types benchmarked
- [ ] v1 vs v2 comparison table complete
- [ ] Learning loop cost projection calculated
- [ ] Results written to `benchmark.md`

## Start

```bash
cd ~/projects/n8n-self-healing
bd prime
npx --yes n8nac list  # verify connection
npm run demo:errors   # baseline run
```

Read CLAUDE.md, then execute the benchmark.
