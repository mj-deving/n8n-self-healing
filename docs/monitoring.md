# Monitoring And Alert Tuning

This document captures the recommended production-polish follow-up for the live WF17 self-healing workflow set. It is intentionally a checklist, not a claim that these changes have already been applied in the live n8n instance.

## Goals

- detect when the primary workflow is failing more often than expected
- distinguish healed failures from escalations
- surface when model-backed diagnosis is unavailable
- keep Slack alerting useful instead of noisy

## Monitor These Signals

### Primary workflow health

Track for `API Data Sync`:

- total executions
- successful executions
- executions that route into the self-healer path
- average `records_synced`

Operational concern:

- a sudden drop in `records_synced`
- a jump in write failures
- repeated timeout or upstream `500` patterns

### Healing outcomes

Track for `Self-Healer`:

- count of `healed=true`
- count of `status=escalated`
- strategy distribution:
  - `backoff`
  - `retry`
  - `fallback`
  - `escalate`
- diagnosis source:
  - `openrouter`
  - deterministic fallback

Operational concern:

- escalation rate climbs while traffic stays flat
- `fallback` spikes, which can indicate degraded model access or upstream schema churn
- `openrouter` diagnoses disappear unexpectedly

### Alert delivery

Track for the Slack alert nodes:

- successful `Send Healed Alert`
- successful `Send Escalation Alert`
- errors on those nodes, even when the workflow continues on error

Operational concern:

- healed or escalated runs occur but Slack confirmations stop appearing
- webhook errors are masked by `continueOnFail`, so execution inspection is required

## Recommended Alert Thresholds

Start with simple thresholds and tune from real traffic.

### High-priority alerts

- 3 or more escalations within 30 minutes
- any repeated `401` escalation pattern
- any case where both:
  - the primary workflow is failing
  - Slack alert delivery is also failing

### Warning-level alerts

- 5 or more healed failures within 30 minutes
- `fallback` strategy becomes the dominant path for more than 1 hour
- `openrouter` diagnosis source drops to zero while `OPENROUTER_API_KEY` is expected to be supplied

## Alert Noise Controls

Use these controls before widening notifications:

- aggregate repeated `429` and `timeout` events into a short window summary
- avoid paging on single healed `429` or `500` events
- keep `401` and repeated escalation clusters page-worthy
- include strategy and workflow name in alert text so responders can filter quickly

## What To Inspect During An Incident

1. Confirm whether the caller supplied `openrouter_api_key` and `slack_webhook_url`.
2. Check whether the failing path was:
   - happy path sync
   - write-error path
   - simulator-only path
3. Inspect `diagnosis_source`, `fix_strategy`, and final `status`.
4. Confirm whether Slack failed silently behind `continueOnFail`.
5. Compare the outcome against the baseline in [verification.md](verification.md).

## Recommended Live Follow-Up Tasks

These are still manual operator tasks, not repo-automated changes:

- add saved execution filters in n8n for:
  - escalated self-healer runs
  - healed self-healer runs
  - failed Slack alert nodes
- review whether Slack alert formatting should include:
  - workflow ID
  - execution ID
  - diagnosis source
  - fix strategy
- decide whether repeated `429` or `timeout` events should roll up into a periodic summary instead of one alert per execution
- define who owns `401` escalation response and credential rotation

## Status

As of April 16, 2026:

- the repo contains the workflow logic and verification evidence
- this checklist captures the production-polish follow-up
- the live-instance tuning itself remains an operator action
