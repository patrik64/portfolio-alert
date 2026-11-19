---
type: C4 Component
title: Download export
status: stable
groma:
  id: download-export
  parent: web-app
  code:
    - scanner: typescript
      file: src/routes/download/+server.ts
      symbol: GET
  group: Publishing
  technology: SvelteKit endpoint
description: Development-only JSON export of every company by fund
---

Serves /download: every company grouped by fund, as a JSON attachment. It answers only on a local dev server. In production it returns 404, because pulling every row would count against the database's free-tier egress.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/routes/download/+server.ts](../../../../../../src/routes/download/%2Bserver.ts) | [src/server/api.ts](../../../../../../src/server/api.ts) | Reads every company | remult |
| [src/routes/download/+server.ts](../../../../../../src/routes/download/%2Bserver.ts) | [src/shared/funds.ts](../../../../../../src/shared/funds.ts) | Lists funds | import |
