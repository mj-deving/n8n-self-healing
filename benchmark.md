# Self-Healing v2 Benchmark

Date: 2026-04-16

Environment:
- n8n `2.11.2`
- Self-Healer workflow `85XCB5Us5UVyu3Da`
- Error Generator workflow `rWAEEC4nCqojdRtu`
- Requested LLM model `anthropic/claude-haiku-4-5`
- OpenRouter returned model `anthropic/claude-4.5-haiku-20251001`

## Method

I executed the benchmark against the live production workflows on `http://172.31.224.1:5678`.

One deviation from `docs/SESSION-BENCHMARK.md` was required: I could read `staticData.global.healLog`, but I could not safely clear it through the exposed workflow API on this instance. Because of that:

- fresh-call measurements used synthetic error types with no prior history
- the six built-in simulator scenarios were measured against the live learned state as-is
- the learning-loop transition was demonstrated with a fresh synthetic error type that healed repeatedly

That still proves the important property: after 3 prior healed matches for the same `error_type`, the 4th execution skips OpenRouter and routes from historical memory.

## Fresh Error Measurements

| Case | Execution | Error Type | Source | Tokens | Cost | Duration | Outcome | Notes |
|---|---:|---|---|---:|---:|---:|---|---|
| Fresh unknown error | `1975` | `x7fresh` | `openrouter` | 370 | 0.001190 | 4976 ms | escalated | Clean no-history LLM diagnosis |
| Fresh healable error | `1977` | `benchretry-20260416` | `openrouter` | 324 | 0.000924 | 3573 ms | healed | Immediate retry pattern |
| No-key deterministic probe | `1981` | `deterministic-probe-20260416` | `deterministic` | 0 | 0 | 123 ms | escalated | No OpenRouter node executed |

## Learning Loop Proof

Synthetic benchmark error: `benchretry-20260416`

The first 3 runs used OpenRouter and healed via `retry`. The 4th run switched to `historical`, skipped the OpenRouter nodes entirely, and returned in `379 ms`.

| Run | Execution | Source | Tokens | Cost | Duration | Strategy | Outcome |
|---|---:|---|---:|---:|---:|---|---|
| 1 | `1977` | `openrouter` | 324 | 0.000924 | 3573 ms | retry | healed |
| 2 | `1978` | `openrouter` | 357 | 0.000929 | 3062 ms | retry | healed |
| 3 | `1979` | `openrouter` | 396 | 0.000976 | 2901 ms | retry | healed |
| 4 | `1980` | `historical` | 0 | 0 | 379 ms | retry | healed |

Observed threshold:
- the code switches to `historical` when there are already 3 healed prior matches
- in practice that means the 4th identical healed error is the first one that skips the LLM

Average for the 3 OpenRouter runs in this loop:
- `359` tokens
- `$0.000943` per diagnosis
- `3179 ms` end-to-end execution time

Historical run delta versus that average:
- `-359` tokens
- `-$0.000943` per repeated diagnosis
- `-2800 ms` for this retry-shaped case

## Built-In Scenario Sweep

I also ran `npm run demo:errors` and separately captured the corresponding Self-Healer executions with full execution data.

| Scenario | Execution | Source | Tokens | Duration | Strategy | Outcome | Notes |
|---|---:|---|---:|---:|---|---|---|
| `429` | `1983` | `historical` | 0 | 30406 ms | backoff | healed | Skipped LLM, but total runtime still dominated by the 30s wait |
| `500` | `1985` | `historical` | 0 | 324 ms | retry | healed | Fast learned retry |
| `401` | `1987` | `openrouter` | 591 | 4217 ms | escalate | escalated | Still needs LLM help |
| `parse` | `1989` | `historical` | 0 | 138 ms | fallback | healed | Learned safe fallback |
| `timeout` | `1991` | `openrouter` | 430 | 10120 ms | backoff | healed | OpenRouter plus wait dominates runtime |
| `schema` | `1993` | `historical` | 0 | 94 ms | fallback | healed | Learned adapter fallback |

Distribution from the live scenario sweep:
- `4/6` scenarios used `historical`
- `2/6` scenarios used `openrouter`
- `0/6` scenarios used `deterministic` because the simulator run included an API key and enough live history already existed for several patterns

Important nuance:
- the learning loop always removes the LLM call for known patterns
- total workflow latency only drops if the chosen repair strategy is not dominated by a `Wait` node
- `429` is the clearest example: diagnosis became free, but the workflow still waits ~30s before retrying

## v1 vs v2

Production diagnosis-path comparison:

| Architecture | Diagnosis Path |
|---|---|
| v1 | `PrepareModelRequest -> RouteDiagnosisMode -> OpenRouterDiagnosis -> ExtractModelDiagnosis -> MockDiagnosis` |
| v2 | `Diagnose Error` with embedded historical matching and deterministic baseline, plus optional OpenRouter branch |

Functional comparison:

| Scenario | v1 LLM Calls | v2 LLM Calls | v2 Source |
|---|---:|---:|---|
| Fresh unknown error | 1 | 1 | `openrouter` |
| Fresh healable error | 1 | 1 | `openrouter` |
| Repeated known error after 3 heals | 1 | 0 | `historical` |
| No API key | 0 | 0 | `deterministic` |

Node-shape comparison:
- v1 diagnosis chain collapsed from 5 diagnosis stages to 1 decision node with in-node logic
- the current live workflow still has helper routing around the optional HTTP call because Code nodes in this runtime cannot make HTTP requests
- separate benchmark demo workflows on the same instance show the stripped-down total-node comparison directly:
  - `WF8 - Benchmark Traditional (5 Tools)` `zQ4KCniPiiOS3EEG`: `8` nodes
  - `WF9 - Benchmark Code-Mode (1 Tool)` `WVeyUVbK32wI6ZGQ`: `4` nodes

## 70% Repeat-Rate Projection

Using the observed learning-loop average of `359` tokens and `$0.000943` per OpenRouter diagnosis:

| Metric | v1 | v2 with 70% repeats | Savings |
|---|---:|---:|---:|
| LLM calls / 100 errors | 100 | 30 | 70 |
| Tokens / 100 errors | 35900 | 10770 | 25130 |
| Cost / 100 errors | 0.0943 | 0.0283 | 0.0660 |

## Conclusion

The benchmark confirms the main value claim for v2:

- the first occurrence of a new pattern still uses OpenRouter when available
- once a pattern has healed successfully 3 times, the 4th occurrence skips the LLM entirely
- repeated known failures therefore become zero-token diagnoses
- the largest savings are on retry and fallback patterns where execution time also drops
- on backoff patterns, the LLM savings are still real, but total workflow runtime remains dominated by the wait window
