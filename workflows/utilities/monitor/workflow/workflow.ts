import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Self-Healing Monitor
// Nodes   : 11  |  Connections: 13
//
// NODE INDEX
// ----------
// ScheduleTrigger            scheduleTrigger          [trigger]
// MonitorWebhook             webhook                  [trigger]
// ResolveMonitorConfig       code
// RouteMonitorConfig         switch
// QuerySelfHealerExecutions  httpRequest              [onError→out(1)]
// AggregateMonitorState      code
// RouteAlertSeverity         switch
// BuildAlertPayload          code
// SendMonitorAlert           httpRequest              [onError→regular]
// FinalizeAlertedResponse    code
// BuildNoAlertResponse       code
//
// ROUTING MAP
// -----------
// ScheduleTrigger → ResolveMonitorConfig → RouteMonitorConfig
// MonitorWebhook → ResolveMonitorConfig
// RouteMonitorConfig.out(0) → QuerySelfHealerExecutions → AggregateMonitorState → RouteAlertSeverity
// QuerySelfHealerExecutions.out(1) → AggregateMonitorState
// RouteAlertSeverity.out(0) → BuildNoAlertResponse
// RouteAlertSeverity.out(1) → BuildAlertPayload → SendMonitorAlert → FinalizeAlertedResponse
// RouteAlertSeverity.out(2) → BuildAlertPayload
// RouteMonitorConfig.out(1) → BuildNoAlertResponse
// </workflow-map>

@workflow({
    id: 'nrpTCtxXa9OxzbZG',
    name: 'Self-Healing Monitor',
    active: false,
    settings: {
        executionOrder: 'v1',
        callerPolicy: 'workflowsFromSameOwner',
        availableInMCP: false,
    },
})
export class MonitorWorkflow {

    @node({
        id: 'b1000004-0001-4000-8000-000000000001',
        name: 'Schedule Trigger',
        type: 'n8n-nodes-base.scheduleTrigger',
        version: 1.3,
        position: [0, 180],
    })
    ScheduleTrigger = {
        rule: {
            interval: [
                {
                    field: 'minutes',
                    minutesInterval: 15,
                },
            ],
        },
    };

    @node({
        id: 'b1000004-0001-4000-8000-000000000002',
        webhookId: 'self-healing-monitor',
        name: 'Monitor Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [0, 360],
    })
    MonitorWebhook = {
        httpMethod: 'POST',
        path: 'self-healing-monitor',
        authentication: 'none',
        responseMode: 'lastNode',
        responseCode: 200,
        responseData: 'firstEntryJson',
        responseBinaryPropertyName: 'data',
    };

    @node({
        id: 'b1000004-0001-4000-8000-000000000003',
        name: 'Resolve Monitor Config',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [260, 260],
    })
    ResolveMonitorConfig = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const body = $json.body || $json || {};
const staticData = $getWorkflowStaticData('global');
const existing = staticData.monitorConfig || {};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const config = {
  n8n_api_key: String(body.n8n_api_key || existing.n8n_api_key || ''),
  slack_webhook_url: String(body.slack_webhook_url || existing.slack_webhook_url || ''),
  self_healer_workflow_id: String(body.self_healer_workflow_id || existing.self_healer_workflow_id || '85XCB5Us5UVyu3Da'),
  limit: Math.max(1, Math.min(100, parseNumber(body.limit, parseNumber(existing.limit, 50)))),
  expect_openrouter: parseBoolean(body.expect_openrouter, parseBoolean(existing.expect_openrouter, false)),
  trigger_source: $json.body ? 'webhook' : 'schedule',
  run_started_at: new Date().toISOString(),
};

staticData.monitorConfig = {
  n8n_api_key: config.n8n_api_key,
  slack_webhook_url: config.slack_webhook_url,
  self_healer_workflow_id: config.self_healer_workflow_id,
  limit: config.limit,
  expect_openrouter: config.expect_openrouter,
  updated_at: config.run_started_at,
};

return {
  json: config
};`,
    };

    @node({
        id: 'b1000004-0001-4000-8000-000000000004',
        name: 'Route Monitor Config',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [520, 260],
    })
    RouteMonitorConfig = {
        mode: 'expression',
        numberOutputs: 2,
        output: '={{ $json.n8n_api_key ? 0 : 1 }}',
        options: {},
    };

    @node({
        id: 'b1000004-0001-4000-8000-000000000005',
        name: 'Query Self-Healer Executions',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [780, 180],
        onError: 'continueErrorOutput',
    })
    QuerySelfHealerExecutions = {
        method: 'GET',
        url: 'http://172.31.224.1:5678/api/v1/executions',
        authentication: 'none',
        sendQuery: true,
        specifyQuery: 'keypair',
        queryParameters: {
            parameters: [
                { name: 'workflowId', value: '={{ $json.self_healer_workflow_id }}' },
                { name: 'limit', value: '={{ String($json.limit || 50) }}' },
                { name: 'includeData', value: 'true' },
            ],
        },
        sendHeaders: true,
        specifyHeaders: 'keypair',
        headerParameters: {
            parameters: [
                { name: 'X-N8N-API-KEY', value: '={{ $json.n8n_api_key }}' },
            ],
        },
        responseType: 'json',
        options: {},
    };

    @node({
        id: 'b1000004-0001-4000-8000-000000000006',
        name: 'Aggregate Monitor State',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1040, 260],
    })
    AggregateMonitorState = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const config = $('Resolve Monitor Config').first().json;
const nowMs = new Date(config.run_started_at || new Date().toISOString()).getTime();
const cutoff30 = nowMs - (30 * 60 * 1000);
const cutoff60 = nowMs - (60 * 60 * 1000);
const queryError = $json.error?.message || $json.message || '';

if (queryError) {
  return {
    json: {
      status: 'query_error',
      severity: 'high',
      reasons: ['Failed to query executions API: ' + queryError],
      workflow_id: config.self_healer_workflow_id,
      trigger_source: config.trigger_source,
      slack_webhook_url: config.slack_webhook_url || '',
      counts: {
        total30: 0,
        healed30: 0,
        escalated30: 0,
        total60: 0,
        strategies30: {},
        strategies60: {},
        diagnosis_sources60: {},
      }
    }
  };
}

const executions = Array.isArray($json.data) ? $json.data : [];
const counts = {
  total30: 0,
  healed30: 0,
  escalated30: 0,
  total60: 0,
  escalated40130: 0,
  strategies30: {},
  strategies60: {},
  diagnosis_sources60: {},
};

for (const execution of executions) {
  const startedMs = Date.parse(execution.startedAt || execution.stoppedAt || config.run_started_at);
  if (!Number.isFinite(startedMs)) continue;

  const runData = execution.data?.resultData?.runData || {};
  const logItem = runData['Write Heal Log']?.[0]?.data?.main?.[0]?.[0]?.json;
  if (!logItem) continue;

  const strategy = String(logItem.strategy || logItem.fix_strategy || 'unknown');
  const diagnosisSource = String(logItem.diagnosis_source || 'unknown');
  const within30 = startedMs >= cutoff30;
  const within60 = startedMs >= cutoff60;

  if (within30) {
    counts.total30 += 1;
    if (logItem.healed) counts.healed30 += 1;
    if (logItem.outcome === 'escalated') counts.escalated30 += 1;
    if (logItem.error_type === '401' && logItem.outcome === 'escalated') counts.escalated40130 += 1;
    counts.strategies30[strategy] = (counts.strategies30[strategy] || 0) + 1;
  }

  if (within60) {
    counts.total60 += 1;
    counts.strategies60[strategy] = (counts.strategies60[strategy] || 0) + 1;
    counts.diagnosis_sources60[diagnosisSource] = (counts.diagnosis_sources60[diagnosisSource] || 0) + 1;
  }
}

const reasons = [];
let severity = 'none';

if (counts.escalated30 >= 3) {
  severity = 'high';
  reasons.push('3 or more escalations within 30 minutes');
}

if (counts.escalated40130 >= 2) {
  severity = 'high';
  reasons.push('Repeated 401 escalation pattern detected');
}

if (severity !== 'high' && counts.healed30 >= 5) {
  severity = 'warning';
  reasons.push('5 or more healed failures within 30 minutes');
}

const dominantStrategy60 = Object.entries(counts.strategies60)
  .sort((left, right) => right[1] - left[1])[0];

if (severity !== 'high' && dominantStrategy60 && dominantStrategy60[0] === 'fallback' && dominantStrategy60[1] > 0) {
  severity = 'warning';
  reasons.push('Fallback is the dominant strategy in the last hour');
}

if (severity !== 'high' && config.expect_openrouter && counts.total60 > 0 && !counts.diagnosis_sources60.openrouter) {
  severity = 'warning';
  reasons.push('OpenRouter diagnoses dropped to zero while OpenRouter is expected');
}

if (!reasons.length && counts.total60 === 0) {
  reasons.push('No recent self-healer executions found in the lookback window');
}

return {
  json: {
    status: severity === 'none' ? 'ok' : 'alert',
    severity,
    reasons,
    workflow_id: config.self_healer_workflow_id,
    trigger_source: config.trigger_source,
    slack_webhook_url: config.slack_webhook_url || '',
    counts,
    dominant_strategy_60m: dominantStrategy60 ? dominantStrategy60[0] : 'none',
    next_cursor: $json.nextCursor || '',
  }
};`,
    };

    @node({
        id: 'b1000004-0001-4000-8000-000000000007',
        name: 'Route Alert Severity',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [1300, 260],
    })
    RouteAlertSeverity = {
        mode: 'expression',
        numberOutputs: 3,
        output: '={{ ({ none: 0, warning: 1, high: 2 })[$json.severity] ?? 0 }}',
        options: {},
    };

    @node({
        id: 'b1000004-0001-4000-8000-000000000008',
        name: 'Build Alert Payload',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1560, 200],
    })
    BuildAlertPayload = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const summary = $json;
const strategies = Object.entries(summary.counts?.strategies60 || {})
  .map(([name, count]) => name + '=' + count)
  .join(', ') || 'none';
const sources = Object.entries(summary.counts?.diagnosis_sources60 || {})
  .map(([name, count]) => name + '=' + count)
  .join(', ') || 'none';

const lines = [
  '[' + String(summary.severity || 'warning').toUpperCase() + '] Self-Healing Monitor',
  'Workflow: ' + (summary.workflow_id || 'unknown'),
  '30m: healed=' + (summary.counts?.healed30 || 0) + ', escalated=' + (summary.counts?.escalated30 || 0),
  '60m strategies: ' + strategies,
  '60m diagnosis sources: ' + sources,
  'Reasons: ' + (Array.isArray(summary.reasons) && summary.reasons.length ? summary.reasons.join('; ') : 'none'),
];

return {
  json: {
    ...summary,
    alert_text: lines.join('\\n')
  }
};`,
    };

    @node({
        id: 'b1000004-0001-4000-8000-000000000009',
        name: 'Send Monitor Alert',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [1820, 200],
        onError: 'continueRegularOutput',
    })
    SendMonitorAlert = {
        method: 'POST',
        url: '={{ $json.slack_webhook_url || "https://example.invalid/slack-webhook-missing" }}',
        authentication: 'none',
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: '={{ JSON.stringify({ text: $json.alert_text }) }}',
        responseType: 'json',
        options: {},
    };

    @node({
        id: 'b1000004-0001-4000-8000-000000000010',
        name: 'Finalize Alerted Response',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2080, 200],
    })
    FinalizeAlertedResponse = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const summary = $('Build Alert Payload').first().json;
const deliveryError = $json.error?.message || '';

return {
  json: {
    status: summary.status,
    severity: summary.severity,
    workflow_id: summary.workflow_id,
    reasons: summary.reasons,
    counts: summary.counts,
    alert_attempted: true,
    alert_delivery_status: deliveryError ? 'failed' : 'sent',
    alert_delivery_error: deliveryError
  }
};`,
    };

    @node({
        id: 'b1000004-0001-4000-8000-000000000011',
        name: 'Build No Alert Response',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1560, 360],
    })
    BuildNoAlertResponse = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const payload = $json.status ? $json : {
  status: 'skipped',
  severity: 'none',
  workflow_id: $json.self_healer_workflow_id || '85XCB5Us5UVyu3Da',
  reasons: ['Missing n8n_api_key monitor config'],
  counts: {
    total30: 0,
    healed30: 0,
    escalated30: 0,
    total60: 0,
    strategies30: {},
    strategies60: {},
    diagnosis_sources60: {},
  }
};

return {
  json: {
    status: payload.status,
    severity: payload.severity,
    workflow_id: payload.workflow_id,
    reasons: payload.reasons,
    counts: payload.counts,
    alert_attempted: false,
    alert_delivery_status: 'not_needed'
  }
};`,
    };

    @links()
    defineRouting() {
        this.ScheduleTrigger.out(0).to(this.ResolveMonitorConfig.in(0));
        this.MonitorWebhook.out(0).to(this.ResolveMonitorConfig.in(0));

        this.ResolveMonitorConfig.out(0).to(this.RouteMonitorConfig.in(0));

        this.RouteMonitorConfig.out(0).to(this.QuerySelfHealerExecutions.in(0));
        this.RouteMonitorConfig.out(1).to(this.BuildNoAlertResponse.in(0));

        this.QuerySelfHealerExecutions.out(0).to(this.AggregateMonitorState.in(0));
        this.QuerySelfHealerExecutions.out(1).to(this.AggregateMonitorState.in(0));

        this.AggregateMonitorState.out(0).to(this.RouteAlertSeverity.in(0));

        this.RouteAlertSeverity.out(0).to(this.BuildNoAlertResponse.in(0));
        this.RouteAlertSeverity.out(1).to(this.BuildAlertPayload.in(0));
        this.RouteAlertSeverity.out(2).to(this.BuildAlertPayload.in(0));

        this.BuildAlertPayload.out(0).to(this.SendMonitorAlert.in(0));
        this.SendMonitorAlert.out(0).to(this.FinalizeAlertedResponse.in(0));
    }
}
