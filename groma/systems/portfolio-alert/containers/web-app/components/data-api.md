---
type: C4 Component
title: Data API
status: stable
groma:
  id: data-api
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/api.ts
      symbol: api
    - scanner: typescript
      file: src/routes/api/[...remult]/+server.ts
    - scanner: typescript
      file: src/hooks.server.ts
      symbol: handle
  group: Data access
  technology: remult, node-postgres, SvelteKit hooks
description: Connects remult to Postgres and serves the data under /api
---

Builds the remult API over the data model and the scrape controller's methods. It connects to Supabase Postgres through a small connection pool on the transaction-mode pooler, or to local JSON files when DATABASE_URL is not set.

The API is mounted both as a SvelteKit server hook and as the /api route, which answer the pages' reads (/api/funds, /api/companies) and the backend-method calls of the dashboard and nightly job. The other server routes run their queries inside its remult context.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/api.ts](../../../../../../src/server/api.ts) | [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | Exposes backend methods | remult controllers |
| [src/server/api.ts](../../../../../../src/server/api.ts) | [src/shared/Company.ts](../../../../../../src/shared/Company.ts) | Serves entities | remult REST |
| [data-api](data-api.md) | [supabase-postgres](../../../../../externals/supabase-postgres.md) | Stores and queries data | node-postgres pool, transaction-mode pooler |
