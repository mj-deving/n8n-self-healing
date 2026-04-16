import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Self-Healer
// Nodes   : 17  |  Connections: 22
// </workflow-map>

@workflow({
    name: 'Self-Healer',
    active: false,
    settings: {
        executionOrder: 'v1',
        callerPolicy: 'workflowsFromSameOwner',
        availableInMCP: false,
    },
})
export class SelfHealerWorkflow {

    @node({
        id: 'b1000002-0001-4000-8000-000000000002',
        webhookId: 'self-healer',
        name: 'Healer Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [0, 360],
    })
    HealerWebhook = {
        httpMethod: 'POST',
        path: 'self-healer',
        authentication: 'none',
        responseMode: 'lastNode',
        responseCode: 200,
        responseData: 'firstEntryJson',
        responseBinaryPropertyName: 'data',
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000001',
        name: 'Execute Workflow Trigger',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.1,
        position: [0, 180],
    })
    ExecuteWorkflowTrigger = {
        inputSource: 'workflowInputs',
        workflowInputs: {
            values: [
                { name: 'error_type', type: 'string' },
                { name: 'error_message', type: 'string' },
                { name: 'node_name', type: 'string' },
                { name: 'workflow_name', type: 'string' },
                { name: 'input_data', type: 'object' },
                { name: 'retry_target_url', type: 'string' },
                { name: 'retry_method', type: 'string' },
                { name: 'fallback_payload', type: 'array' },
                { name: 'timestamp', type: 'string' },
                { name: 'openrouter_api_key', type: 'string' },
                { name: 'openrouter_model', type: 'string' },
                { name: 'slack_webhook_url', type: 'string' },
            ],
        },
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000003',
        name: 'Normalize Error Input',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [260, 260],
    })
    NormalizeErrorInput = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `let payload = $json.body || $json || {};

if (!payload.error_type && $('Execute Workflow Trigger').isExecuted) {
  try {
    payload = $('Execute Workflow Trigger').item.json;
  } catch (error) {
    // Keep webhook payload if trigger data is unavailable.
  }
}

return {
  json: {
    error_type: payload.error_type || 'unknown',
    error_message: payload.error_message || 'Unknown workflow error',
    node_name: payload.node_name || 'Unknown Node',
    workflow_name: payload.workflow_name || 'Unknown Workflow',
    input_data: payload.input_data || {},
    retry_target_url: payload.retry_target_url || '',
    retry_method: payload.retry_method || 'GET',
    fallback_payload: payload.fallback_payload || [],
    timestamp: payload.timestamp || new Date().toISOString(),
    openrouter_api_key: payload.openrouter_api_key || '',
    openrouter_model: payload.openrouter_model || '',
    slack_webhook_url: payload.slack_webhook_url || ''
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000004',
        name: 'Prepare Model Request',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [520, 260],
    })
    PrepareModelRequest = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const ctx = $json;
const requestBody = {
  max_tokens: 256,
  response_format: { type: 'json_object' },
  messages: [
    {
      role: 'system',
      content: 'You are an n8n workflow error diagnostician. Analyze the error and respond with JSON: { "diagnosis": string, "fix_strategy": "retry"|"backoff"|"fallback"|"escalate", "wait_seconds": number, "details": string }.'
    },
    {
      role: 'user',
      content: JSON.stringify({
        error_type: ctx.error_type,
        error_message: ctx.error_message,
        node_name: ctx.node_name,
        workflow_name: ctx.workflow_name,
        input_data: ctx.input_data,
        timestamp: ctx.timestamp
      }, null, 2)
    }
  ]
};

if (ctx.openrouter_model) {
  requestBody.model = ctx.openrouter_model;
}

return {
  json: {
    ...ctx,
    requestBody: JSON.stringify(requestBody)
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000005',
        name: 'Route Diagnosis Mode',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [780, 260],
    })
    RouteDiagnosisMode = {
        mode: 'expression',
        numberOutputs: 2,
        output: '={{ $json.openrouter_api_key ? 0 : 1 }}',
        options: {},
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000006',
        name: 'OpenRouter Diagnosis',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [1040, 160],
        onError: 'continueErrorOutput',
    })
    OpenRouterDiagnosis = {
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        authentication: 'none',
        sendHeaders: true,
        specifyHeaders: 'keypair',
        headerParameters: {
            parameters: [
                { name: 'Authorization', value: '={{ "Bearer " + $json.openrouter_api_key }}' },
                { name: 'HTTP-Referer', value: 'https://github.com/mj-deving/n8n-self-healing' },
                { name: 'X-OpenRouter-Title', value: 'n8n-self-healing' },
                { name: 'content-type', value: 'application/json' },
            ],
        },
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: '={{ $json.requestBody }}',
        responseType: 'json',
        options: {},
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000007',
        name: 'Extract Model Diagnosis',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1300, 160],
    })
    ExtractModelDiagnosis = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const ctx = $('Prepare Model Request').item.json;
const content = $json.choices?.[0]?.message?.content;
const text = Array.isArray(content)
  ? content.map((part) => part.text || part.content || '').join('\\n').trim()
  : String(content || '').trim();
const jsonMatch = text.match(/\\{[\\s\\S]*\\}/);
let diagnosis;

try {
  diagnosis = JSON.parse(jsonMatch ? jsonMatch[0] : text);
} catch (error) {
  diagnosis = {
    diagnosis: 'The model returned non-JSON output; falling back to escalation.',
    fix_strategy: 'escalate',
    wait_seconds: 0,
    details: text || 'No model output'
  };
}

return {
  json: {
    ...ctx,
    diagnosis_source: 'openrouter',
    diagnosis: diagnosis.diagnosis,
    fix_strategy: diagnosis.fix_strategy,
    wait_seconds: Number(diagnosis.wait_seconds || 0),
    details: diagnosis.details || diagnosis.diagnosis
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000008',
        name: 'Mock Diagnosis',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1040, 360],
    })
    MockDiagnosis = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const ctx = $json.error_type ? $json : $('Prepare Model Request').item.json;

const matrix = {
  '429': {
    diagnosis: 'The upstream API is rate limiting requests.',
    fix_strategy: 'backoff',
    wait_seconds: 30,
    details: 'Wait and retry a healthy endpoint after the backoff window.'
  },
  '500': {
    diagnosis: 'The upstream service returned an internal error.',
    fix_strategy: 'retry',
    wait_seconds: 0,
    details: 'Retry once against the recovery URL.'
  },
  '401': {
    diagnosis: 'Authentication failed and requires credential rotation.',
    fix_strategy: 'escalate',
    wait_seconds: 0,
    details: 'Escalation is required because secrets cannot be repaired automatically.'
  },
  'parse': {
    diagnosis: 'The payload could not be parsed safely.',
    fix_strategy: 'fallback',
    wait_seconds: 0,
    details: 'Switch to a safe fallback payload.'
  },
  'timeout': {
    diagnosis: 'The dependency timed out before returning a response.',
    fix_strategy: 'backoff',
    wait_seconds: 15,
    details: 'Retry after a short delay with a longer timeout budget.'
  },
  'schema': {
    diagnosis: 'The response schema changed or was malformed.',
    fix_strategy: 'fallback',
    wait_seconds: 0,
    details: 'Use an adapter fallback to normalize the shape.'
  },
  'write': {
    diagnosis: 'The destination write path is unavailable.',
    fix_strategy: 'fallback',
    wait_seconds: 0,
    details: 'Queue the payload in a fallback file so the sync is not lost.'
  },
  'fetch': {
    diagnosis: 'The source API call failed before the transform stage.',
    fix_strategy: 'retry',
    wait_seconds: 0,
    details: 'Retry the source request once.'
  }
};

const result = matrix[ctx.error_type] || {
  diagnosis: 'The failure did not match a known repair pattern.',
  fix_strategy: 'escalate',
  wait_seconds: 0,
  details: 'Escalate for manual review.'
};

return {
  json: {
    ...ctx,
    diagnosis_source: 'mock',
    diagnosis: result.diagnosis,
    fix_strategy: result.fix_strategy,
    wait_seconds: result.wait_seconds,
    details: result.details
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000009',
        name: 'Route Fix Strategy',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [1560, 260],
    })
    RouteFixStrategy = {
        mode: 'expression',
        numberOutputs: 4,
        output: '={{ ({ retry: 0, backoff: 1, fallback: 2, escalate: 3 })[$json.fix_strategy] ?? 3 }}',
        options: {},
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000010',
        name: 'Retry Original Request',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [1820, 80],
        onError: 'continueErrorOutput',
    })
    RetryOriginalRequest = {
        method: '={{ $json.retry_method || "GET" }}',
        url: '={{ $json.retry_target_url || "https://jsonplaceholder.typicode.com/posts/1" }}',
        authentication: 'none',
        responseType: 'json',
        options: {},
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000011',
        name: 'Wait Before Retry',
        type: 'n8n-nodes-base.wait',
        version: 1.1,
        position: [1820, 240],
    })
    WaitBeforeRetry = {
        resume: 'timeInterval',
        amount: '={{ Number($json.wait_seconds || 30) }}',
        unit: 'seconds',
        dateTime: '',
        formTitle: 'Self-Healer backoff wait',
        responseBinaryPropertyName: 'data',
        incomingAuthentication: 'none',
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000012',
        name: 'Retry After Backoff',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [2080, 240],
        onError: 'continueErrorOutput',
    })
    RetryAfterBackoff = {
        method: '={{ $json.retry_method || "GET" }}',
        url: '={{ $json.retry_target_url || "https://jsonplaceholder.typicode.com/posts/1" }}',
        authentication: 'none',
        responseType: 'json',
        options: {},
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000013',
        name: 'Build Fallback Outcome',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1820, 420],
    })
    BuildFallbackOutcome = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const payload = Array.isArray($json.fallback_payload) ? $json.fallback_payload : [];
const staticData = $getWorkflowStaticData('global');
const fallbackEntry = {
  timestamp: new Date().toISOString(),
  workflow: $json.workflow_name,
  node_name: $json.node_name,
  error_type: $json.error_type,
  strategy: 'fallback',
  payload
};

const existing = Array.isArray(staticData.fallbackOutcomes) ? staticData.fallbackOutcomes : [];
existing.push(fallbackEntry);
staticData.fallbackOutcomes = existing.slice(-50);
staticData.lastFallbackOutcome = fallbackEntry;

return {
  json: {
    ...$json,
    healed: true,
    outcome: 'healed',
    repaired_with: 'fallback',
    retry_count: 0,
    response_payload: payload,
    storage_backend: 'workflow_static_data',
    fallback_entry: fallbackEntry
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000014',
        name: 'Build Retry Success Outcome',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2340, 160],
    })
    BuildRetrySuccessOutcome = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const strategy = $('Route Fix Strategy').item.json.fix_strategy;
return {
  json: {
    ...$('Route Fix Strategy').item.json,
    healed: true,
    outcome: 'healed',
    repaired_with: strategy,
    retry_count: strategy === 'backoff' ? 1 : 1,
    response_payload: $json
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000015',
        name: 'Build Retry Failure Outcome',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2340, 20],
    })
    BuildRetryFailureOutcome = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const ctx = $('Route Fix Strategy').item.json;
const errorMessage =
  $json.error?.message ||
  $json.message ||
  'Retry attempt failed.';

return {
  json: {
    ...ctx,
    healed: false,
    outcome: 'escalated',
    repaired_with: ctx.fix_strategy,
    retry_count: 1,
    escalation_reason: errorMessage
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000021',
        name: 'Build Escalation Outcome',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2600, 20],
    })
    BuildEscalationOutcome = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `return {
  json: {
    ...$json,
    healed: false,
    outcome: 'escalated',
    repaired_with: 'escalate',
    retry_count: 0,
    escalation_reason: $json.details || $json.error_message || 'Manual escalation required.'
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000016',
        name: 'Send Escalation Alert',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [2600, 80],
        onError: 'continueRegularOutput',
    })
    SendEscalationAlert = {
        method: 'POST',
        url: '={{ $json.slack_webhook_url || "https://example.invalid/slack-webhook-missing" }}',
        authentication: 'none',
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: '={{ JSON.stringify({ text: "Escalation: " + $json.workflow_name + " — " + ($json.error_message || $json.escalation_reason || "Unknown error") + " — AI could not heal" }) }}',
        responseType: 'json',
        options: {},
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000017',
        name: 'Write Heal Log',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2860, 260],
    })
    WriteHealLog = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const staticData = $getWorkflowStaticData('global');
const entry = {
  timestamp: new Date().toISOString(),
  workflow: $json.workflow_name,
  node_name: $json.node_name,
  error_type: $json.error_type,
  error_message: $json.error_message,
  ai_diagnosis: $json.diagnosis,
  diagnosis_source: $json.diagnosis_source,
  fix_strategy: $json.fix_strategy,
  outcome: $json.outcome,
  retry_count: Number($json.retry_count || 0),
  total_heal_time_ms: Number($json.wait_seconds || 0) * 1000,
  details: $json.details || '',
};

const existing = Array.isArray(staticData.healLog) ? staticData.healLog : [];
existing.push(entry);
staticData.healLog = existing.slice(-100);
staticData.lastHealEntry = entry;

return {
  json: {
    healed: Boolean($json.healed),
    diagnosis: $json.diagnosis,
    strategy: $json.fix_strategy,
    outcome: $json.outcome,
    workflow: $json.workflow_name,
    retry_count: Number($json.retry_count || 0),
    log_entry: entry,
    storage_backend: 'workflow_static_data'
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000018',
        name: 'Route Notification',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [3120, 260],
    })
    RouteNotification = {
        mode: 'expression',
        numberOutputs: 2,
        output: '={{ $json.healed ? 0 : 1 }}',
        options: {},
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000019',
        name: 'Send Healed Alert',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [3380, 180],
        onError: 'continueRegularOutput',
    })
    SendHealedAlert = {
        method: 'POST',
        url: '={{ $json.slack_webhook_url || "https://example.invalid/slack-webhook-missing" }}',
        authentication: 'none',
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: '={{ JSON.stringify({ text: "Self-Healed: " + $json.workflow + " — " + $json.diagnosis + " (Strategy: " + $json.strategy + ", " + ($json.log_entry.total_heal_time_ms || 0) + "ms)" }) }}',
        responseType: 'json',
        options: {},
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000020',
        name: 'Finalize Response',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [3640, 260],
    })
    FinalizeResponse = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const payload = $json.workflow ? $json : $('Write Heal Log').item.json;
return {
  json: {
    healed: payload.healed,
    diagnosis: payload.diagnosis,
    strategy: payload.strategy,
    outcome: payload.outcome,
    workflow: payload.workflow,
    retry_count: payload.retry_count
  }
};`,
    };

    @links()
    defineRouting() {
        this.ExecuteWorkflowTrigger.out(0).to(this.NormalizeErrorInput.in(0));
        this.HealerWebhook.out(0).to(this.NormalizeErrorInput.in(0));

        this.NormalizeErrorInput.out(0).to(this.PrepareModelRequest.in(0));
        this.PrepareModelRequest.out(0).to(this.RouteDiagnosisMode.in(0));

        this.RouteDiagnosisMode.out(0).to(this.OpenRouterDiagnosis.in(0));
        this.RouteDiagnosisMode.out(1).to(this.MockDiagnosis.in(0));

        this.OpenRouterDiagnosis.out(0).to(this.ExtractModelDiagnosis.in(0));
        this.OpenRouterDiagnosis.out(1).to(this.MockDiagnosis.in(0));

        this.ExtractModelDiagnosis.out(0).to(this.RouteFixStrategy.in(0));
        this.MockDiagnosis.out(0).to(this.RouteFixStrategy.in(0));

        this.RouteFixStrategy.out(0).to(this.RetryOriginalRequest.in(0));
        this.RouteFixStrategy.out(1).to(this.WaitBeforeRetry.in(0));
        this.RouteFixStrategy.out(2).to(this.BuildFallbackOutcome.in(0));
        this.RouteFixStrategy.out(3).to(this.BuildEscalationOutcome.in(0));

        this.WaitBeforeRetry.out(0).to(this.RetryAfterBackoff.in(0));

        this.RetryOriginalRequest.out(0).to(this.BuildRetrySuccessOutcome.in(0));
        this.RetryOriginalRequest.out(1).to(this.BuildRetryFailureOutcome.in(0));
        this.RetryAfterBackoff.out(0).to(this.BuildRetrySuccessOutcome.in(0));
        this.RetryAfterBackoff.out(1).to(this.BuildRetryFailureOutcome.in(0));

        this.BuildRetryFailureOutcome.out(0).to(this.WriteHealLog.in(0));
        this.BuildRetryFailureOutcome.out(0).to(this.SendEscalationAlert.in(0));
        this.BuildEscalationOutcome.out(0).to(this.WriteHealLog.in(0));
        this.BuildEscalationOutcome.out(0).to(this.SendEscalationAlert.in(0));

        this.BuildRetrySuccessOutcome.out(0).to(this.WriteHealLog.in(0));
        this.BuildFallbackOutcome.out(0).to(this.WriteHealLog.in(0));

        this.WriteHealLog.out(0).to(this.RouteNotification.in(0));

        this.RouteNotification.out(0).to(this.SendHealedAlert.in(0));
        this.RouteNotification.out(1).to(this.FinalizeResponse.in(0));

        this.SendHealedAlert.out(0).to(this.FinalizeResponse.in(0));
    }
}
