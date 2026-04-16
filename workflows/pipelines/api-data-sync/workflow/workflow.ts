import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : API Data Sync
// Nodes   : 11  |  Connections: 14
//
// NODE INDEX
// ScheduleTrigger            scheduleTrigger          [trigger]
// ManualSyncWebhook          webhook                  [trigger]
// PrepareSyncRequest         code
// FetchSourcePosts           httpRequest              [error-output]
// TransformSourceData        code                     [error-output]
// WriteOutputFile            code                     [error-output]
// BuildSuccessResponse       code
// FetchErrorContext          code
// TransformErrorContext      code
// WriteErrorContext          code
// InvokeSelfHealer           httpRequest              [error-output]
// BuildHealedResponse        code
// BuildHealerUnavailable     code
// </workflow-map>

@workflow({
    id: 'jBbMvA2RK39YlEM9',
    name: 'API Data Sync',
    active: true,
    settings: {
        executionOrder: 'v1',
        callerPolicy: 'workflowsFromSameOwner',
        availableInMCP: false,
    },
})
export class ApiDataSyncWorkflow {

    @node({
        id: 'b1000001-0001-4000-8000-000000000001',
        name: 'Schedule Trigger',
        type: 'n8n-nodes-base.scheduleTrigger',
        version: 1.3,
        position: [0, 180],
    })
    ScheduleTrigger = {
        rule: {
            interval: [
                {
                    field: 'hours',
                    hoursInterval: 1,
                },
            ],
        },
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000002',
        webhookId: 'api-data-sync',
        name: 'Manual Sync Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [0, 360],
    })
    ManualSyncWebhook = {
        httpMethod: 'POST',
        path: 'api-data-sync',
        authentication: 'none',
        responseMode: 'lastNode',
        responseCode: 200,
        responseData: 'firstEntryJson',
        responseBinaryPropertyName: 'data',
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000003',
        name: 'Prepare Sync Request',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [260, 260],
    })
    PrepareSyncRequest = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const body = $json.body || $json || {};
const sourceUrl = body.source_url || 'https://jsonplaceholder.typicode.com/posts';
const storageKey = body.storage_key || 'api-data-sync:last-output';
const maxItems = Number(body.max_items || 10);
const forceWriteError = Boolean(body.force_write_error || false);
const openrouterApiKey = String(body.openrouter_api_key || '');
const openrouterModel = String(body.openrouter_model || '');
const slackWebhookUrl = String(body.slack_webhook_url || '');
const selfHealerWebhookUrl = String(body.self_healer_webhook_url || 'http://172.31.224.1:5678/webhook/self-healer');

return {
  json: {
    requestedAt: new Date().toISOString(),
    sourceUrl,
    storageKey,
    maxItems,
    forceWriteError,
    workflowName: 'API Data Sync',
    openrouter_api_key: openrouterApiKey,
    openrouter_model: openrouterModel,
    slack_webhook_url: slackWebhookUrl,
    self_healer_webhook_url: selfHealerWebhookUrl
  }
};`,
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000004',
        name: 'Fetch Source Posts',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [520, 260],
        onError: 'continueErrorOutput',
    })
    FetchSourcePosts = {
        method: 'GET',
        url: '={{ $json.sourceUrl }}',
        authentication: 'none',
        responseType: 'json',
        options: {},
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000005',
        name: 'Transform Source Data',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 180],
        onError: 'continueErrorOutput',
    })
    TransformSourceData = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const request = $('Prepare Sync Request').first().json;
const payload = $input
  .all()
  .map((item) => item.json)
  .flatMap((item) => Array.isArray(item) ? item : [item])
  .filter((item) => item && typeof item === 'object');

if (!payload.length) {
  throw new Error('Expected an array of posts from the source API.');
}

const transformed = payload.slice(0, request.maxItems).map((post) => ({
  id: post.id,
  user_id: post.userId ?? null,
  title: String(post.title || '').toUpperCase(),
  body: String(post.body || '').slice(0, 120),
  synced_at: request.requestedAt,
}));

return [{
  json: {
    workflowName: request.workflowName,
    sourceUrl: request.sourceUrl,
    storageKey: request.storageKey,
    requestedAt: request.requestedAt,
    forceWriteError: request.forceWriteError,
    openrouter_api_key: request.openrouter_api_key || '',
    openrouter_model: request.openrouter_model || '',
    slack_webhook_url: request.slack_webhook_url || '',
    self_healer_webhook_url: request.self_healer_webhook_url || '',
    transformed,
    recordCount: transformed.length
  }
}];`,
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000006',
        name: 'Write Output File',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1040, 180],
        onError: 'continueErrorOutput',
    })
    WriteOutputFile = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `if ($json.forceWriteError) {
  throw new Error('Forced output write failure for testing.');
}

const staticData = $getWorkflowStaticData('global');
const key = $json.storageKey || 'api-data-sync:last-output';
const snapshot = {
  workflow: $json.workflowName,
  source_url: $json.sourceUrl,
  records_synced: $json.recordCount,
  synced_at: $json.requestedAt,
  items: Array.isArray($json.transformed) ? $json.transformed : [],
};

if (!staticData.syncOutputs || typeof staticData.syncOutputs !== 'object' || Array.isArray(staticData.syncOutputs)) {
  staticData.syncOutputs = {};
}

staticData.syncOutputs[key] = snapshot;
staticData.lastOutputSnapshot = snapshot;

return {
  json: {
    status: 'success',
    workflow: $json.workflowName,
    source_url: $json.sourceUrl,
    storage_key: key,
    storage_backend: 'workflow_static_data',
    records_synced: $json.recordCount,
    synced_at: $json.requestedAt
  }
};`,
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000007',
        name: 'Build Success Response',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1300, 180],
    })
    BuildSuccessResponse = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `return {
  json: {
    status: 'success',
    healed: false,
    workflow: $json.workflow,
    records_synced: $json.records_synced,
    storage_key: $json.storage_key,
    storage_backend: $json.storage_backend,
    source_url: $json.source_url,
    synced_at: $json.synced_at
  }
};`,
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000008',
        name: 'Fetch Error Context',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 360],
    })
    FetchErrorContext = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const request = $('Prepare Sync Request').item.json;
const envelope = $json || {};
const errorMessage =
  envelope.error?.message ||
  envelope.message ||
  envelope.description ||
  'HTTP source fetch failed.';

return {
  json: {
    error_type: 'fetch',
    error_message: errorMessage,
    node_name: 'Fetch Source Posts',
    workflow_name: request.workflowName,
    input_data: request,
    retry_target_url: request.sourceUrl,
    retry_method: 'GET',
    timestamp: new Date().toISOString(),
    openrouter_api_key: request.openrouter_api_key || '',
    openrouter_model: request.openrouter_model || '',
    slack_webhook_url: request.slack_webhook_url || '',
    self_healer_webhook_url: request.self_healer_webhook_url || ''
  }
};`,
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000009',
        name: 'Transform Error Context',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1040, 360],
    })
    TransformErrorContext = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const request = $('Prepare Sync Request').item.json;
const errorMessage =
  $json.error?.message ||
  $json.message ||
  'Transform step detected malformed or unexpected source data.';

return {
  json: {
    error_type: 'schema',
    error_message: errorMessage,
    node_name: 'Transform Source Data',
    workflow_name: request.workflowName,
    input_data: request,
    fallback_payload: [],
    timestamp: new Date().toISOString(),
    openrouter_api_key: request.openrouter_api_key || '',
    openrouter_model: request.openrouter_model || '',
    slack_webhook_url: request.slack_webhook_url || '',
    self_healer_webhook_url: request.self_healer_webhook_url || ''
  }
};`,
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000010',
        name: 'Write Error Context',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1300, 360],
    })
    WriteErrorContext = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const transformed = $('Transform Source Data').item.json;
const errorMessage =
  $json.error?.message ||
  $json.message ||
  'Output file write failed.';

return {
  json: {
    error_type: 'write',
    error_message: errorMessage,
    node_name: 'Write Output File',
    workflow_name: transformed.workflowName,
    input_data: transformed.transformed,
    fallback_payload: transformed.transformed,
    retry_target_url: transformed.sourceUrl,
    retry_method: 'GET',
    timestamp: new Date().toISOString(),
    openrouter_api_key: transformed.openrouter_api_key || '',
    openrouter_model: transformed.openrouter_model || '',
    slack_webhook_url: transformed.slack_webhook_url || '',
    self_healer_webhook_url: transformed.self_healer_webhook_url || ''
  }
};`,
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000011',
        name: 'Invoke Self-Healer',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [1560, 360],
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
        id: 'b1000001-0001-4000-8000-000000000012',
        name: 'Build Healed Response',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1820, 280],
    })
    BuildHealedResponse = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `return {
  json: {
    status: $json.healed ? 'healed' : 'escalated',
    healed: Boolean($json.healed),
    workflow: 'API Data Sync',
    diagnosis: $json.diagnosis || 'No diagnosis returned',
    strategy: $json.strategy || $json.fix_strategy || 'unknown',
    outcome: $json.outcome || 'unknown'
  }
};`,
    };

    @node({
        id: 'b1000001-0001-4000-8000-000000000013',
        name: 'Build Healer Unavailable Response',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1820, 460],
    })
    BuildHealerUnavailableResponse = {
        mode: 'runOnceForEachItem',
        language: 'javaScript',
        jsCode: `const errorMessage =
  $json.error?.message ||
  $json.message ||
  'Failed to call the Self-Healer webhook.';

return {
  json: {
    status: 'error',
    healed: false,
    workflow: 'API Data Sync',
    diagnosis: 'Self-healer invocation failed',
    strategy: 'escalate',
    outcome: 'healer_unavailable',
    error_message: errorMessage
  }
};`,
    };

    @links()
    defineRouting() {
        this.ScheduleTrigger.out(0).to(this.PrepareSyncRequest.in(0));
        this.ManualSyncWebhook.out(0).to(this.PrepareSyncRequest.in(0));

        this.PrepareSyncRequest.out(0).to(this.FetchSourcePosts.in(0));

        this.FetchSourcePosts.out(0).to(this.TransformSourceData.in(0));
        this.FetchSourcePosts.out(1).to(this.FetchErrorContext.in(0));

        this.TransformSourceData.out(0).to(this.WriteOutputFile.in(0));
        this.TransformSourceData.out(1).to(this.TransformErrorContext.in(0));

        this.WriteOutputFile.out(0).to(this.BuildSuccessResponse.in(0));
        this.WriteOutputFile.out(1).to(this.WriteErrorContext.in(0));

        this.FetchErrorContext.out(0).to(this.InvokeSelfHealer.in(0));
        this.TransformErrorContext.out(0).to(this.InvokeSelfHealer.in(0));
        this.WriteErrorContext.out(0).to(this.InvokeSelfHealer.in(0));

        this.InvokeSelfHealer.out(0).to(this.BuildHealedResponse.in(0));
        this.InvokeSelfHealer.out(1).to(this.BuildHealerUnavailableResponse.in(0));
    }
}
