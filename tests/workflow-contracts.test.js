const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('self-healer collapses diagnosis into one code node with historical and OpenRouter paths', () => {
  const source = read('workflows/agents/self-healer/workflow/workflow.ts');

  assert.match(source, /name: 'Diagnose Error'/);
  assert.match(source, /\$getWorkflowStaticData\('global'\)/);
  assert.match(source, /\$\('Normalize Error Input'\)\.first\(\)\.json/);
  assert.match(source, /const relevantHistory = healHistory/);
  assert.match(source, /const historicalMatches = relevantHistory/);
  assert.match(source, /\$helpers\.httpRequest\(\{/);
  assert.match(source, /diagnosis_source: 'historical'/);
  assert.match(source, /historicalEntry\?\.success_rate\?\.by_strategy/);
  assert.match(source, /upstream_reachable: upstreamReachable/);
  assert.match(source, /execution_context: executionSummary/);
  assert.match(source, /diagnosis_source: 'openrouter'/);
  assert.match(source, /diagnosis_source: 'deterministic'/);
  assert.match(source, /name: 'Check Upstream Health'/);
  assert.match(source, /name: 'Build Upstream Context'/);
  assert.match(source, /name: 'Fetch Execution Context'/);
  assert.match(source, /name: 'Build Execution Context'/);
  assert.match(source, /name: 'Wait For Parallel Context'/);
  assert.match(source, /this\.NormalizeErrorInput\.out\(0\)\.to\(this\.CheckUpstreamHealth\.in\(0\)\);/);
  assert.match(source, /this\.NormalizeErrorInput\.out\(0\)\.to\(this\.FetchExecutionContext\.in\(0\)\);/);
  assert.match(source, /this\.WaitForParallelContext\.out\(0\)\.to\(this\.DiagnoseError\.in\(0\)\);/);
  assert.match(source, /this\.DiagnoseError\.out\(0\)\.to\(this\.RouteFixStrategy\.in\(0\)\);/);

  assert.doesNotMatch(source, /name: 'Prepare Model Request'/);
  assert.doesNotMatch(source, /name: 'Route Diagnosis Mode'/);
  assert.doesNotMatch(source, /name: 'OpenRouter Diagnosis'/);
  assert.doesNotMatch(source, /name: 'Extract Model Diagnosis'/);
  assert.doesNotMatch(source, /name: 'Mock Diagnosis'/);
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
  assert.match(source, /success_rate: entry\.success_rate/);
  assert.match(source, /slack_webhook_url:\s*\$json\.slack_webhook_url \|\| ''/);
  assert.match(source, /url: '=\{\{ \$json\.slack_webhook_url \|\| "https:\/\/example\.invalid\/slack-webhook-missing" \}\}'/);
});

test('api-data-sync preserves runtime healer context through transform and write-error paths', () => {
  const source = read('workflows/pipelines/api-data-sync/workflow/workflow.ts');

  assert.match(source, /openrouter_api_key:\s*openrouterApiKey/);
  assert.match(source, /openrouter_model:\s*openrouterModel/);
  assert.match(source, /slack_webhook_url:\s*slackWebhookUrl/);
  assert.match(source, /self_healer_webhook_url:\s*selfHealerWebhookUrl/);

  assert.match(source, /openrouter_api_key:\s*transformed\.openrouter_api_key \|\| ''/);
  assert.match(source, /openrouter_model:\s*transformed\.openrouter_model \|\| ''/);
  assert.match(source, /slack_webhook_url:\s*transformed\.slack_webhook_url \|\| ''/);
  assert.match(source, /self_healer_webhook_url:\s*transformed\.self_healer_webhook_url \|\| ''/);
});

test('error simulator falls back cleanly for unknown scenarios', () => {
  const source = read('workflows/utilities/error-simulator/workflow/workflow.ts');

  assert.match(source, /node_name: 'Unknown Scenario'/);
  assert.match(source, /error_message: 'Unknown simulator error type requested\.'/);
  assert.match(source, /self_healer_webhook_url:\s*request\.self_healer_webhook_url \|\| ''/);
});

test('demo script covers all six supported simulator scenarios', () => {
  const source = read('scripts/demo-all-errors.sh');

  for (const errorType of ['429', '500', '401', 'parse', 'timeout', 'schema']) {
    assert.match(source, new RegExp(`"${errorType}"`));
  }
});
