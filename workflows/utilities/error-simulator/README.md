# Error Generator

Utility workflow that simulates six error classes and forwards them into the `Self-Healer` webhook so the repair flow can be demonstrated repeatedly.

## Triggering

```bash
POST /webhook/simulate-error
```

## Request body

```json
{
  "error_type": "429"
}
```

Allowed values:

- `429`
- `500`
- `401`
- `parse`
- `timeout`
- `schema`

## Behavior

Each branch intentionally creates or captures an error, converts it into a normalized error context, and calls the healer workflow through HTTP.
