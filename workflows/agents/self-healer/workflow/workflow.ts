import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Self-Healer
// Nodes   : 22  |  Connections: 28
// </workflow-map>

@workflow({
    id: '85XCB5Us5UVyu3Da',
    name: 'Self-Healer',
    active: true,
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
                { name: 'execution_id', type: 'string' },
                { name: 'n8n_api_key', type: 'string' },
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
    slack_webhook_url: payload.slack_webhook_url || '',
    execution_id: payload.execution_id || '',
    n8n_api_key: payload.n8n_api_key || ''
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000004',
        name: 'Diagnose Error',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [900, 260],
    })
    DiagnoseError = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const ctx = $('Normalize Error Input').first().json;
const staticData = $getWorkflowStaticData('global');
const healLog = Array.isArray(staticData.healLog) ? staticData.healLog : [];
const healHistory = healLog.filter((entry) => entry && entry.error_type === ctx.error_type);
const upstreamContext = $('Build Upstream Context').first().json;
const executionContextData = $('Build Execution Context').first().json;
const relevantHistory = healHistory;
const historicalMatches = relevantHistory
  .filter((entry) => entry.outcome === 'healed')
  .slice(-5);
const upstreamReachable = upstreamContext?.upstream_reachable ?? 'unknown';
const executionSummary = executionContextData?.execution_context || null;
const executionInsight = executionSummary?.failed_node
  ? 'Execution inspection confirmed ' + executionSummary.failed_node + (executionSummary.error_message ? ' failed with: ' + executionSummary.error_message : '.')
  : '';

const strategyCounts = historicalMatches.reduce((acc, entry) => {
  const strategy = entry.fix_strategy || entry.strategy || entry.repaired_with || '';
  if (strategy) {
    acc[strategy] = (acc[strategy] || 0) + 1;
  }
  return acc;
}, {});

const dominantStrategy = Object.entries(strategyCounts)
  .sort((left, right) => right[1] - left[1])[0];

if (dominantStrategy && dominantStrategy[1] >= 3) {
  const historicalEntry = [...historicalMatches]
    .reverse()
    .find((entry) => (entry.fix_strategy || entry.strategy || entry.repaired_with) === dominantStrategy[0]) || historicalMatches[historicalMatches.length - 1];
  const dominantSuccessRate = historicalEntry?.success_rate?.by_strategy?.[dominantStrategy[0]];
  const formattedSuccessRate = dominantSuccessRate?.formatted || (dominantStrategy[1] + '/' + historicalMatches.length);

  return {
    json: {
      ...ctx,
      diagnosis_source: 'historical',
      diagnosis: historicalEntry?.ai_diagnosis || ('Previously healed ' + dominantStrategy[1] + ' times with ' + dominantStrategy[0] + '.'),
      fix_strategy: dominantStrategy[0],
      wait_seconds: Number(historicalEntry?.total_heal_time_ms || 0) / 1000,
      details: 'Skipped LLM - historical success rate for ' + ctx.error_type + ' via ' + dominantStrategy[0] + ': ' + formattedSuccessRate + (executionInsight ? '. ' + executionInsight : ''),
      upstream_reachable: upstreamReachable,
      execution_context: executionSummary
    }
  };
}

let diagnosis = null;

if (ctx.openrouter_api_key) {
  try {
    const response = await $helpers.httpRequest({
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        Authorization: 'Bearer ' + ctx.openrouter_api_key,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/mj-deving/n8n-self-healing',
        'X-OpenRouter-Title': 'n8n-self-healing',
      },
      body: {
        model: ctx.openrouter_model || 'anthropic/claude-haiku-4-5',
        max_tokens: 256,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an n8n workflow error diagnostician. Respond with JSON: { "diagnosis": string, "fix_strategy": "retry"|"backoff"|"fallback"|"escalate", "wait_seconds": number, "details": string }.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              error_type: ctx.error_type,
              error_message: ctx.error_message,
              node_name: ctx.node_name,
              workflow_name: ctx.workflow_name,
              input_data: ctx.input_data,
              timestamp: ctx.timestamp,
              upstream_reachable: upstreamReachable,
              recent_heal_history: relevantHistory.slice(-5).map((entry) => ({
                outcome: entry.outcome,
                fix_strategy: entry.fix_strategy || entry.strategy || entry.repaired_with || '',
                diagnosis_source: entry.diagnosis_source || '',
              })),
              execution_context: executionSummary
            }, null, 2)
          }
        ]
      },
      json: true
    });

    const content = response?.choices?.[0]?.message?.content || '';
    const text = Array.isArray(content)
      ? content.map((part) => part.text || part.content || '').join('\\n').trim()
      : String(content || '').trim();
    const jsonMatch = text.match(/\\{[\\s\\S]*\\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);

    diagnosis = {
      diagnosis_source: 'openrouter',
      diagnosis: parsed.diagnosis,
      fix_strategy: parsed.fix_strategy,
      wait_seconds: Number(parsed.wait_seconds || 0),
      details: parsed.details || parsed.diagnosis
    };
  } catch (error) {
    diagnosis = null;
  }
}

if (!diagnosis) {
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

  if (ctx.error_type === '500' && upstreamReachable === true) {
    result.diagnosis = 'The upstream service returned an internal error but the dependency is still reachable.';
    result.fix_strategy = 'retry';
    result.wait_seconds = 0;
    result.details = 'HEAD health check succeeded, so this looks transient. Retry immediately.';
  }

  diagnosis = {
    ...result,
    diagnosis_source: 'deterministic'
  };
}

if (executionInsight) {
  diagnosis.details = (diagnosis.details || diagnosis.diagnosis) + ' ' + executionInsight;
}

return {
  json: {
    ...ctx,
    diagnosis_source: diagnosis.diagnosis_source,
    diagnosis: diagnosis.diagnosis,
    fix_strategy: diagnosis.fix_strategy,
    wait_seconds: Number(diagnosis.wait_seconds || 0),
    details: diagnosis.details || diagnosis.diagnosis,
    upstream_reachable: upstreamReachable,
    execution_context: executionSummary
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000022',
        name: 'Check Upstream Health',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [520, 140],
        onError: 'continueRegularOutput',
    })
    CheckUpstreamHealth = {
        method: 'HEAD',
        url: '={{ $json.retry_target_url || "https://example.invalid/skip-upstream-check" }}',
        authentication: 'none',
        responseType: 'text',
        options: {
            timeout: 5000,
        },
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000023',
        name: 'Build Upstream Context',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 140],
    })
    BuildUpstreamContext = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const original = $('Normalize Error Input').first().json;
const hasTarget = Boolean(original.retry_target_url);
const errorMessage = $json.error?.message || $json.message || '';

return {
  json: {
    upstream_reachable: !hasTarget ? 'unknown' : !errorMessage
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000024',
        name: 'Fetch Execution Context',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [520, 380],
        onError: 'continueRegularOutput',
    })
    FetchExecutionContext = {
        method: 'GET',
        url: '={{ $json.execution_id ? "http://172.31.224.1:5678/api/v1/executions/" + $json.execution_id + "?includeData=true" : "https://example.invalid/skip-execution-context" }}',
        authentication: 'none',
        sendHeaders: true,
        specifyHeaders: 'keypair',
        headerParameters: {
            parameters: [
                { name: 'X-N8N-API-KEY', value: '={{ $json.n8n_api_key || "" }}' },
            ],
        },
        responseType: 'json',
        options: {},
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000025',
        name: 'Build Execution Context',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 380],
    })
    BuildExecutionContext = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const original = $('Normalize Error Input').first().json;

if (!original.execution_id || !original.n8n_api_key) {
  return {
    json: {
      execution_context: null
    }
  };
}

const requestError = $json.error?.message || $json.message || '';
if (requestError) {
  return {
    json: {
      execution_context: null
    }
  };
}

const responsePayload = $json || {};
const executionPayload = responsePayload.id ? responsePayload : (responsePayload.data?.id ? responsePayload.data : responsePayload);
const workflowData = responsePayload.workflowData || executionPayload.workflowData || {};
const resultData = executionPayload.data?.resultData || executionPayload.resultData || {};
const runData = resultData.runData || {};
const runtimeData = resultData.runtimeData || {};
const executionError = resultData.error || {};

function toPlain(value) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return String(value);
  }
}

function summarize(value, depth = 0) {
  const plain = toPlain(value);

  if (plain === null || typeof plain !== 'object') {
    return plain;
  }

  if (depth >= 2) {
    return Array.isArray(plain) ? '[array]' : '[object]';
  }

  if (Array.isArray(plain)) {
    return plain.slice(0, 2).map((item) => summarize(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(plain)
      .slice(0, 8)
      .map(([key, entryValue]) => [key, summarize(entryValue, depth + 1)])
  );
}

function getLatestRun(nodeName) {
  const entries = runData[nodeName];
  return Array.isArray(entries) && entries.length ? entries[entries.length - 1] : null;
}

function getOutputJson(nodeName, outputIndex = 0) {
  const run = getLatestRun(nodeName);
  const bucket = run?.data?.main?.[outputIndex];
  return Array.isArray(bucket) && bucket[0]?.json ? bucket[0].json : null;
}

function inspectNode(nodeName) {
  if (!nodeName) {
    return null;
  }

  const run = getLatestRun(nodeName);
  if (!run) {
    return null;
  }

  const outputs = Array.isArray(run.data?.main)
    ? run.data.main.flatMap((bucket, outputIndex) => (
        Array.isArray(bucket)
          ? bucket.map((item) => ({ outputIndex, json: item?.json || null }))
          : []
      ))
    : [];

  const errorOutput = outputs.find((entry) => (
    entry.outputIndex > 0 && entry.json && (entry.json.error || entry.json.error_message || entry.json.message)
  ));
  const regularOutput = outputs.find((entry) => entry.outputIndex === 0 && entry.json);
  const source = Array.isArray(run.source) && run.source.length ? run.source[0] : null;
  const sourceNode = source?.previousNode || '';
  const sourceOutputIndex = typeof source?.previousNodeOutput === 'number' ? source.previousNodeOutput : 0;
  const sourceJson = sourceNode ? getOutputJson(sourceNode, sourceOutputIndex) : null;
  const errorJson = errorOutput?.json || null;

  return {
    node_name: nodeName,
    source_node: sourceNode,
    source_output_index: sourceOutputIndex,
    error_output_index: typeof errorOutput?.outputIndex === 'number' ? errorOutput.outputIndex : null,
    execution_status: run.executionStatus || '',
    execution_time_ms: Number(run.executionTime || 0),
    input_preview: summarize(sourceJson || original.input_data || null),
    output_preview: summarize(regularOutput?.json || null),
    error_message: errorJson?.error || errorJson?.error_message || errorJson?.message || '',
    error_payload: summarize(errorJson),
  };
}

const candidateNodes = Array.from(new Set([
  String(original.node_name || ''),
  String(executionError.node || ''),
])).filter(Boolean);

const inspectedNode = candidateNodes
  .map((nodeName) => inspectNode(nodeName))
  .find((entry) => entry && (entry.error_message || entry.error_payload || entry.input_preview))
  || inspectNode(String(original.node_name || ''))
  || null;

return {
  json: {
    execution_context: {
      id: executionPayload.id || responsePayload.id || original.execution_id,
      workflow_id: executionPayload.workflowId || responsePayload.workflowId || workflowData.id || '',
      workflow_name: workflowData.name || original.workflow_name || '',
      status: executionPayload.status || responsePayload.status || '',
      mode: executionPayload.mode || responsePayload.mode || '',
      started_at: executionPayload.startedAt || responsePayload.startedAt || '',
      stopped_at: executionPayload.stoppedAt || responsePayload.stoppedAt || '',
      trigger_node: runtimeData.triggerNode?.name || '',
      failed_node: inspectedNode?.node_name || executionError.node || original.node_name || '',
      source_node: inspectedNode?.source_node || '',
      error_message: inspectedNode?.error_message || executionError.message || original.error_message || '',
      failed_node_input: inspectedNode?.input_preview || summarize(original.input_data || null),
      failed_node_output: inspectedNode?.output_preview || null,
      error_payload: inspectedNode?.error_payload || summarize(executionError),
      node_execution_status: inspectedNode?.execution_status || '',
      node_execution_time_ms: inspectedNode?.execution_time_ms || 0,
    }
  }
};`,
    };

    @node({
        id: 'b1000002-0001-4000-8000-000000000026',
        name: 'Wait For Parallel Context',
        type: 'n8n-nodes-base.merge',
        version: 3.2,
        position: [1040, 260],
    })
    WaitForParallelContext = {
        mode: 'chooseBranch',
        numberInputs: 2,
        chooseBranchMode: 'waitForAll',
        output: 'specifiedInput',
        useDataOfInput: '1',
        options: {},
        query: 'SELECT * FROM input1',
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
  upstream_reachable: $json.upstream_reachable ?? 'unknown',
  execution_id: $json.execution_id || $json.execution_context?.id || '',
  execution_context: $json.execution_context || null,
};

const existing = Array.isArray(staticData.healLog) ? staticData.healLog : [];
const nextLog = existing.concat(entry).slice(-100);
const entriesForErrorType = nextLog.filter((item) => item && item.error_type === entry.error_type);

const summary = entriesForErrorType.reduce((acc, item) => {
  const strategy = item.fix_strategy || item.strategy || item.repaired_with || 'unknown';
  const bucket = acc.by_strategy[strategy] || { total: 0, healed: 0, escalated: 0 };

  bucket.total += 1;
  if (item.outcome === 'healed') {
    bucket.healed += 1;
    acc.healed += 1;
  } else {
    bucket.escalated += 1;
    acc.escalated += 1;
  }

  acc.total += 1;
  acc.by_strategy[strategy] = bucket;
  return acc;
}, { total: 0, healed: 0, escalated: 0, by_strategy: {} });

const withRates = Object.fromEntries(
  Object.entries(summary.by_strategy).map(([strategy, counts]) => {
    const ratio = counts.total ? counts.healed / counts.total : 0;
    return [
      strategy,
      {
        ...counts,
        ratio,
        percent: Math.round(ratio * 100),
        formatted: counts.healed + '/' + counts.total,
      }
    ];
  })
);

const overallRatio = summary.total ? summary.healed / summary.total : 0;
entry.success_rate = {
  error_type: entry.error_type,
  overall: {
    total: summary.total,
    healed: summary.healed,
    escalated: summary.escalated,
    ratio: overallRatio,
    percent: Math.round(overallRatio * 100),
    formatted: summary.healed + '/' + summary.total,
  },
  by_strategy: withRates,
};

nextLog[nextLog.length - 1] = entry;
staticData.healLog = nextLog;
staticData.healStatsByErrorType = {
  ...(staticData.healStatsByErrorType || {}),
  [entry.error_type]: entry.success_rate,
};
staticData.lastHealEntry = entry;

return {
  json: {
    healed: Boolean($json.healed),
    diagnosis: $json.diagnosis,
    strategy: $json.fix_strategy,
    outcome: $json.outcome,
    workflow: $json.workflow_name,
    workflow_name: $json.workflow_name,
    node_name: $json.node_name,
    error_type: $json.error_type,
    error_message: $json.error_message,
    retry_count: Number($json.retry_count || 0),
    diagnosis_source: $json.diagnosis_source,
    upstream_reachable: $json.upstream_reachable ?? 'unknown',
    slack_webhook_url: $json.slack_webhook_url || '',
    execution_id: $json.execution_id || '',
    execution_context: $json.execution_context || null,
    success_rate: entry.success_rate,
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
    retry_count: payload.retry_count,
    execution_id: payload.execution_id || payload.execution_context?.id || '',
    execution_context: payload.execution_context || null
  }
};`,
    };

    @links()
    defineRouting() {
        this.ExecuteWorkflowTrigger.out(0).to(this.NormalizeErrorInput.in(0));
        this.HealerWebhook.out(0).to(this.NormalizeErrorInput.in(0));

        this.NormalizeErrorInput.out(0).to(this.CheckUpstreamHealth.in(0));
        this.NormalizeErrorInput.out(0).to(this.FetchExecutionContext.in(0));

        this.CheckUpstreamHealth.out(0).to(this.BuildUpstreamContext.in(0));
        this.FetchExecutionContext.out(0).to(this.BuildExecutionContext.in(0));

        this.BuildUpstreamContext.out(0).to(this.WaitForParallelContext.in(0));
        this.BuildExecutionContext.out(0).to(this.WaitForParallelContext.in(1));

        this.WaitForParallelContext.out(0).to(this.DiagnoseError.in(0));
        this.DiagnoseError.out(0).to(this.RouteFixStrategy.in(0));

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
