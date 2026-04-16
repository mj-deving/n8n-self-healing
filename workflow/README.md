# Workflow Files

This directory contains the root-level workflow export for standalone distribution.

## How to Use

1. Export your workflow from n8n: Menu > Download
2. Replace `workflow.json` with your exported file
3. Validate the JSON: `npm run validate`
4. Check for secrets: `npm run check-secrets`

## Important

- The `workflow.json` here is a placeholder. Replace it with an actual export if you want a single-file distribution artifact.
- Never commit actual credentials. Use n8n credential references only.
- For multi-workflow development, use the packages under `workflows/`.
- This root-level export is mainly for sharing a single workflow outside the repo structure.

## Validation

```bash
npm run validate
npm run validate:workflows
npm run check-secrets
```
