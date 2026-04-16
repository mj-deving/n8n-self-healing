const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('self-healer keeps diagnosis logic in one code node and externalizes OpenRouter I/O', () => {
  const source = read('workflows/agents/self-healer/workflow/workflow.ts');

  assert.match(source, /name: 'Diagnose Error'/);
  assert.match(source, /\$getWorkflowStaticData\('global'\)/);
  assert.match(source, /\$\('Normalize Error Input'\)\.first\(\)\.json/);
  assert.match(source, /const relevantHistory = healHistory/);
  assert.match(source, /const historicalMatches = relevantHistory/);
  assert.match(source, /diagnosis_source: 'historical'/);
  assert.match(source, /historicalEntry\?\.success_rate\?\.by_strategy/);
  assert.match(source, /upstream_reachable: upstreamReachable/);
  assert.match(source, /execution_context: executionSummary/);
  assert.match(source, /should_call_openrouter:/);
  assert.match(source, /openrouter_request_body:/);
  assert.match(source, /diagnosis_source: 'deterministic'/);
  assert.match(source, /name: 'Check Upstream Health'/);
  assert.match(source, /name: 'Build Upstream Context'/);
  assert.match(source, /name: 'Fetch Execution Context'/);
  assert.match(source, /includeData=true/);
  assert.match(source, /name: 'Build Execution Context'/);
  assert.match(source, /const runData = resultData\.runData \|\| \{\}/);
  assert.match(source, /failed_node_input:/);
  assert.match(source, /source_node:/);
  assert.match(source, /Execution inspection confirmed/);
  assert.match(source, /name: 'Route Diagnosis Provider'/);
  assert.match(source, /name: 'OpenRouter Diagnosis'/);
  assert.match(source, /name: 'Extract OpenRouter Diagnosis'/);
  assert.match(source, /diagnosis_source: 'openrouter'/);
  assert.match(source, /name: 'Wait For Parallel Context'/);
  assert.match(source, /this\.NormalizeErrorInput\.out\(0\)\.to\(this\.CheckUpstreamHealth\.in\(0\)\);/);
  assert.match(source, /this\.NormalizeErrorInput\.out\(0\)\.to\(this\.FetchExecutionContext\.in\(0\)\);/);
  assert.match(source, /this\.WaitForParallelContext\.out\(0\)\.to\(this\.DiagnoseError\.in\(0\)\);/);
  assert.match(source, /this\.DiagnoseError\.out\(0\)\.to\(this\.RouteDiagnosisProvider\.in\(0\)\);/);
  assert.match(source, /this\.RouteDiagnosisProvider\.out\(0\)\.to\(this\.OpenRouterDiagnosis\.in\(0\)\);/);
  assert.match(source, /this\.RouteDiagnosisProvider\.out\(1\)\.to\(this\.RouteFixStrategy\.in\(0\)\);/);
  assert.match(source, /this\.OpenRouterDiagnosis\.out\(0\)\.to\(this\.ExtractOpenRouterDiagnosis\.in\(0\)\);/);
  assert.match(source, /this\.ExtractOpenRouterDiagnosis\.out\(0\)\.to\(this\.RouteFixStrategy\.in\(0\)\);/);

  assert.doesNotMatch(source, /name: 'Prepare Model Request'/);
  assert.doesNotMatch(source, /name: 'Route Diagnosis Mode'/);
  assert.doesNotMatch(source, /name: 'Extract Model Diagnosis'/);
  assert.doesNotMatch(source, /name: 'Mock Diagnosis'/);
  assert.doesNotMatch(source, /\$helpers\.httpRequest\(\{/);
});

test('self-healer preserves slack webhook context into healed alerts', () => {
  const source = read('workflows/agents/self-healer/workflow/workflow.ts');

  assert.match(source, /name: 'Write Heal Log'/);
  assert.match(source, /execution_id: payload\.execution_id \|\| ''/);
  assert.match(source, /n8n_api_key: payload\.n8n_api_key \|\| ''/);
  assert.match(source, /const entriesForErrorType = nextLog\.filter/);
  assert.match(source, /entry\.success_rate = \{/);
  assert.match(source, /staticData\.healStatsByErrorType = \{/);
  assert.match(source, /upstream_reachable: \$json\.upstream_reachable \?\? 'unknown'/);
  assert.match(source, /execution_context: \$json\.execution_context \|\| null/);
  assert.match(source, /success_rate: entry\.success_rate/);
  assert.match(source, /slack_webhook_url:\s*\$json\.slack_webhook_url \|\| ''/);
  assert.match(source, /url: '=\{\{ \$json\.slack_webhook_url \|\| "https:\/\/example\.invalid\/slack-webhook-missing" \}\}'/);
});

test('api-data-sync preserves runtime healer and execution context through error handoff paths', () => {
  const source = read('workflows/pipelines/api-data-sync/workflow/workflow.ts');

  assert.match(source, /const n8nApiKey = String\(body\.n8n_api_key \|\| ''\);/);
  assert.match(source, /const executionId = typeof \$execution\?\.id === 'undefined' \? '' : String\(\$execution\.id\);/);
  assert.match(source, /openrouter_api_key:\s*openrouterApiKey/);
  assert.match(source, /openrouter_model:\s*openrouterModel/);
  assert.match(source, /slack_webhook_url:\s*slackWebhookUrl/);
  assert.match(source, /self_healer_webhook_url:\s*selfHealerWebhookUrl/);
  assert.match(source, /execution_id:\s*executionId/);
  assert.match(source, /n8n_api_key:\s*n8nApiKey/);

  assert.match(source, /openrouter_api_key:\s*transformed\.openrouter_api_key \|\| ''/);
  assert.match(source, /openrouter_model:\s*transformed\.openrouter_model \|\| ''/);
  assert.match(source, /slack_webhook_url:\s*transformed\.slack_webhook_url \|\| ''/);
  assert.match(source, /self_healer_webhook_url:\s*transformed\.self_healer_webhook_url \|\| ''/);
  assert.match(source, /execution_id:\s*transformed\.execution_id \|\| ''/);
  assert.match(source, /n8n_api_key:\s*transformed\.n8n_api_key \|\| ''/);
  assert.match(source, /execution_context:\s*\$json\.execution_context \|\| null/);
});

test('error simulator falls back cleanly for unknown scenarios', () => {
  const source = read('workflows/utilities/error-simulator/workflow/workflow.ts');

  assert.match(source, /node_name: 'Unknown Scenario'/);
  assert.match(source, /error_message: 'Unknown simulator error type requested\.'/);
  assert.match(source, /self_healer_webhook_url:\s*request\.self_healer_webhook_url \|\| ''/);
});

test('monitor workflow polls self-healer executions and routes alert severity', () => {
  const source = read('workflows/utilities/monitor/workflow/workflow.ts');

  assert.match(source, /name: 'Self-Healing Monitor'/);
  assert.match(source, /name: 'Schedule Trigger'/);
  assert.match(source, /minutesInterval: 15/);
  assert.match(source, /name: 'Monitor Webhook'/);
  assert.match(source, /path: 'self-healing-monitor'/);
  assert.match(source, /name: 'Query Self-Healer Executions'/);
  assert.match(source, /api\/v1\/executions/);
  assert.match(source, /includeData', value: 'true'/);
  assert.match(source, /3 or more escalations within 30 minutes/);
  assert.match(source, /5 or more healed failures within 30 minutes/);
  assert.match(source, /Fallback is the dominant strategy in the last hour/);
  assert.match(source, /name: 'Route Alert Severity'/);
  assert.match(source, /this\.RouteAlertSeverity\.out\(1\)\.to\(this\.BuildAlertPayload\.in\(0\)\);/);
  assert.match(source, /this\.RouteAlertSeverity\.out\(2\)\.to\(this\.BuildAlertPayload\.in\(0\)\);/);
});

test('demo script covers all six supported simulator scenarios', () => {
  const source = read('scripts/demo-all-errors.sh');

  for (const errorType of ['429', '500', '401', 'parse', 'timeout', 'schema']) {
    assert.match(source, new RegExp(`"${errorType}"`));
  }
});
