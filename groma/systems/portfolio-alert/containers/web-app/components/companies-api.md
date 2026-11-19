---
type: C4 Component
title: Public companies API
status: stable
groma:
  id: companies-api
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/companies-api.ts
    - scanner: typescript
      file: src/routes/api/v1/companies/+server.ts
      symbol: GET
  group: Publishing
  technology: SvelteKit endpoint, SQL through remult
description: Answers GET /api/v1/companies for outside clients
---

The public, read-only API over the stored companies. It parses and validates the query: a window over recent newcomers or the whole catalogue, word matches on name and category, exclusions, funds, exit status, paging, and JSON or Markdown output. A bad parameter gets a 400 that lists them all. A company several funds back comes back once, naming every fund with its own category and first sighting. Baseline imports are not counted as recent, and the CDN caches each distinct query for an hour.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/companies-api.ts](../../../../../../src/server/companies-api.ts) | [src/server/api.ts](../../../../../../src/server/api.ts) | Queries companies | SQL through remult |
| [src/server/companies-api.ts](../../../../../../src/server/companies-api.ts) | [src/shared/funds.ts](../../../../../../src/shared/funds.ts) | Names funds | import |
| [src/server/companies-api.ts](../../../../../../src/server/companies-api.ts) | [src/shared/timeline.ts](../../../../../../src/shared/timeline.ts) | Bounds the window | import |
