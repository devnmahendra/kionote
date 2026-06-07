# Contributing to KioNote

KioNote is an early OSS project focused on turning community conversations into reusable knowledge.

## Development

```bash
npm test
npm start
```

Use the sample Telegram export for development. Never add real private chat exports, generated stores, API keys, or personal data to the repository.

## Pull requests

- Keep changes focused on one community workflow.
- Add or update tests for parser, ranking, and analysis behavior.
- Explain privacy or retention implications for new importers and AI providers.
- Preserve the credential-free local demo path.

## Good first contributions

- Add parser fixtures for more Telegram message shapes.
- Improve FAQ answer pairing and citations.
- Add accessible loading and error states.
- Implement a PostgreSQL/pgvector storage adapter.
