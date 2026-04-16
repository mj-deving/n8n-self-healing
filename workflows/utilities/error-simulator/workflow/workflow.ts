import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
    id: 'rWAEEC4nCqojdRtu',
    name: 'Error Generator',
    active: true,
    settings: {
        executionOrder: 'v1',
        callerPolicy: 'workflowsFromSameOwner',
        availableInMCP: false,
    },
})
export class ErrorGeneratorWorkflow {

    @node({
        id: 'b1000003-0001-4000-8000-000000000001',
        webhookId: 'simulate-error',
        name: 'Simulation Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [0, 260],
    })
    SimulationWebhook = {
        httpMethod: 'POST',
        path: 'simulate-error',
        authentication: 'none',
        responseMode: 'lastNode',
        responseCode: 200,
        responseData: 'firstEntryJson',
        responseBinaryPropertyName: 'data',
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000002',
        name: 'Normalize Scenario',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [260, 260],
    })
    NormalizeScenario = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const body = $json.body || $json || {};
return {
  json: {
    error_type: String(body.error_type || '429'),
    timestamp: new Date().toISOString(),
    openrouter_api_key: String(body.openrouter_api_key || ''),
    openrouter_model: String(body.openrouter_model || ''),
    slack_webhook_url: String(body.slack_webhook_url || ''),
    self_healer_webhook_url: String(body.self_healer_webhook_url || 'http://172.31.224.1:5678/webhook/self-healer')
  }
};`,
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000003',
        name: 'Route Scenario',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [520, 260],
    })
    RouteScenario = {
        mode: 'expression',
        numberOutputs: 6,
        output: '={{ ({ "429": 0, "500": 1, "401": 2, "parse": 3, "timeout": 4, "schema": 5 })[$json.error_type] ?? 0 }}',
        options: {},
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000004',
        name: 'Simulate 429',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 40],
        onError: 'continueErrorOutput',
    })
    Simulate429 = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `throw new Error('429: Rate limit exceeded by upstream API.');`,
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000005',
        name: 'Simulate 500',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 140],
        onError: 'continueErrorOutput',
    })
    Simulate500 = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `throw new Error('500: Internal server error from upstream service.');`,
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000006',
        name: 'Simulate 401',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 240],
        onError: 'continueErrorOutput',
    })
    Simulate401 = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `throw new Error('401: Authentication failed due to invalid credentials.');`,
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000007',
        name: 'Simulate Parse Error',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 340],
        onError: 'continueErrorOutput',
    })
    SimulateParseError = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `JSON.parse('{"broken": }');
return { json: { ok: true } };`,
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000008',
        name: 'Simulate Timeout',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 440],
        onError: 'continueErrorOutput',
    })
    SimulateTimeout = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `throw new Error('timeout: Upstream request exceeded the allowed time budget.');`,
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000009',
        name: 'Simulate Schema Error',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 540],
        onError: 'continueErrorOutput',
    })
    SimulateSchemaError = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const payload = { unexpected: true, nested: { wrong: 'shape' } };
if (!Array.isArray(payload.items)) {
  throw new Error('Expected payload.items to be an array.');
}
return { json: payload };`,
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000010',
        name: 'Build Error Context',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1040, 260],
    })
    BuildErrorContext = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const request = $('Normalize Scenario').item.json;
const scenario = request.error_type;
const defaults = {
  '429': {
    node_name: 'Simulate 429',
    error_message: 'Rate limit response generated by simulator.',
    retry_target_url: 'https://jsonplaceholder.typicode.com/posts/1',
    retry_method: 'GET'
  },
  '500': {
    node_name: 'Simulate 500',
    error_message: 'Server error response generated by simulator.',
    retry_target_url: 'https://jsonplaceholder.typicode.com/posts/1',
    retry_method: 'GET'
  },
  '401': {
    node_name: 'Simulate 401',
    error_message: 'Authentication error generated by simulator.',
    retry_target_url: '',
    retry_method: 'GET'
  },
  'parse': {
    node_name: 'Simulate Parse Error',
    error_message: 'Invalid JSON generated by simulator.',
    retry_target_url: '',
    retry_method: 'GET'
  },
  'timeout': {
    node_name: 'Simulate Timeout',
    error_message: 'Timeout generated by simulator.',
    retry_target_url: 'https://jsonplaceholder.typicode.com/posts/1',
    retry_method: 'GET'
  },
  'schema': {
    node_name: 'Simulate Schema Error',
    error_message: 'Schema mismatch generated by simulator.',
    retry_target_url: '',
    retry_method: 'GET'
  }
};

const envelope = $json || {};
const selected = defaults[scenario] || {
  node_name: 'Unknown Scenario',
  error_message: 'Unknown simulator error type requested.',
  retry_target_url: '',
  retry_method: 'GET'
};

return {
  json: {
    error_type: scenario,
    error_message: envelope.error?.message || envelope.message || selected.error_message,
    node_name: selected.node_name,
    workflow_name: 'Error Generator',
    input_data: { simulator: true, scenario },
    retry_target_url: selected.retry_target_url,
    retry_method: selected.retry_method,
    fallback_payload: scenario === 'schema' ? [{ adapted: true, source: 'schema-fallback' }] : [],
    timestamp: new Date().toISOString(),
    openrouter_api_key: request.openrouter_api_key || '',
    openrouter_model: request.openrouter_model || '',
    slack_webhook_url: request.slack_webhook_url || '',
    self_healer_webhook_url: request.self_healer_webhook_url || ''
  }
};`,
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000011',
        name: 'Invoke Self-Healer',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [1300, 260],
        onError: 'continueErrorOutput',
    })
    InvokeSelfHealer = {
        method: 'POST',
        url: '={{ $json.self_healer_webhook_url || "http://172.31.224.1:5678/webhook/self-healer" }}',
        authentication: 'none',
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: '={{ JSON.stringify($json) }}',
        responseType: 'json',
        options: {},
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000012',
        name: 'Unexpected Success',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1040, 620],
    })
    UnexpectedSuccess = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `return {
  json: {
    status: 'unexpected_success',
    message: 'The simulator branch completed without emitting an error.'
  }
};`,
    };

    @node({
        id: 'b1000003-0001-4000-8000-000000000013',
        name: 'Build Simulation Response',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1560, 260],
    })
    BuildSimulationResponse = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `if ($json.status === 'unexpected_success') {
  return { json: $json };
}

const errorMessage =
  $json.error?.message ||
  $json.message;

if (errorMessage && !$json.healed && !$json.strategy) {
  return {
    json: {
      status: 'error',
      message: errorMessage
    }
  };
}

return {
  json: {
    status: $json.healed ? 'healed' : 'escalated',
    scenario: $('Normalize Scenario').item.json.error_type,
    healed: Boolean($json.healed),
    diagnosis: $json.diagnosis || 'No diagnosis returned',
    strategy: $json.strategy || 'unknown',
    outcome: $json.outcome || 'unknown'
  }
};`,
    };

    @links()
    defineRouting() {
        this.SimulationWebhook.out(0).to(this.NormalizeScenario.in(0));
        this.NormalizeScenario.out(0).to(this.RouteScenario.in(0));

        this.RouteScenario.out(0).to(this.Simulate429.in(0));
        this.RouteScenario.out(1).to(this.Simulate500.in(0));
        this.RouteScenario.out(2).to(this.Simulate401.in(0));
        this.RouteScenario.out(3).to(this.SimulateParseError.in(0));
        this.RouteScenario.out(4).to(this.SimulateTimeout.in(0));
        this.RouteScenario.out(5).to(this.SimulateSchemaError.in(0));

        this.Simulate429.out(0).to(this.UnexpectedSuccess.in(0));
        this.Simulate500.out(0).to(this.UnexpectedSuccess.in(0));
        this.Simulate401.out(0).to(this.UnexpectedSuccess.in(0));
        this.SimulateParseError.out(0).to(this.UnexpectedSuccess.in(0));
        this.SimulateTimeout.out(0).to(this.UnexpectedSuccess.in(0));
        this.SimulateSchemaError.out(0).to(this.UnexpectedSuccess.in(0));

        this.Simulate429.out(1).to(this.BuildErrorContext.in(0));
        this.Simulate500.out(1).to(this.BuildErrorContext.in(0));
        this.Simulate401.out(1).to(this.BuildErrorContext.in(0));
        this.SimulateParseError.out(1).to(this.BuildErrorContext.in(0));
        this.SimulateTimeout.out(1).to(this.BuildErrorContext.in(0));
        this.SimulateSchemaError.out(1).to(this.BuildErrorContext.in(0));

        this.BuildErrorContext.out(0).to(this.InvokeSelfHealer.in(0));
        this.InvokeSelfHealer.out(0).to(this.BuildSimulationResponse.in(0));
        this.InvokeSelfHealer.out(1).to(this.BuildSimulationResponse.in(0));

        this.UnexpectedSuccess.out(0).to(this.BuildSimulationResponse.in(0));
    }
}
