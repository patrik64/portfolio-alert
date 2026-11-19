---
type: C4 Component
title: Monthly statistics
status: stable
groma:
  id: statistics
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/statistics.ts
    - scanner: typescript
      file: src/routes/statistics.json/+server.ts
      symbol: GET
  group: Publishing
  technology: SvelteKit endpoint, TypeScript
description: Counts each month's newcomers for the statistics page
---

Serves /statistics.json: for every month since the timeline began, its newcomers counted on the server, so the browser receives a few kilobytes of totals.

The counts cover the funds that added the most companies, the most common categories, the companies found each day, the stages funds came in at, what the companies' web addresses end in, and companies more than one fund added. Months follow the nightly job's Europe/Vienna calendar. Categories are read through the category tags, and the CDN caches the answer for an hour.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/routes/statistics.json/+server.ts](../../../../../../src/routes/statistics.json/%2Bserver.ts) | [src/server/api.ts](../../../../../../src/server/api.ts) | Queries newcomers | remult |
| [src/server/statistics.ts](../../../../../../src/server/statistics.ts) | [src/server/tags.ts](../../../../../../src/server/tags.ts) | Classifies categories | function call |
| [src/server/statistics.ts](../../../../../../src/server/statistics.ts) | [src/shared/funds.ts](../../../../../../src/shared/funds.ts) | Names funds | import |
| [src/routes/statistics.json/+server.ts](../../../../../../src/routes/statistics.json/%2Bserver.ts) | [src/shared/timeline.ts](../../../../../../src/shared/timeline.ts) | Bounds the months | import |
