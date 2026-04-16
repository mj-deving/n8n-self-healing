# API Data Sync

Primary workflow that fetches data from JSONPlaceholder, transforms the payload, stores the latest output snapshot in workflow static data, and invokes the healer workflow whenever a recoverable node emits an error branch.

## Triggering

- `Schedule Trigger` runs the workflow on an interval
- `Webhook` allows manual execution with test overrides

Webhook endpoint after push:

```bash
POST /webhook/api-data-sync
```

## Manual test payload

```json
{
  "source_url": "https://jsonplaceholder.typicode.com/posts",
  "max_items": 5,
  "force_write_error": false
}
```

## Node Flow

1. Prepare sync request
2. Fetch source posts via `HTTP Request`
3. Transform titles and bodies via `Code`
4. Store the latest payload snapshot in workflow static data
5. On fetch, transform, or write failure, build structured error context
6. Call `Self-Healer` through its webhook

## Files

- Source of truth: `workflow/workflow.ts`
- Placeholder export slot: `workflow/workflow.json`
