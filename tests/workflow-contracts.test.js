const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('self-healer preserves slack webhook context into healed alerts', () => {
  const source = read('workflows/agents/self-healer/workflow/workflow.ts');

  assert.match(source, /name: 'Write Heal Log'/);
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
