---
type: C4 Component
title: RSS feed
status: stable
groma:
  id: rss-feed
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/rss.ts
    - scanner: typescript
      file: src/routes/rss.xml/+server.ts
      symbol: GET
  group: Publishing
  technology: SvelteKit endpoint, RSS 2.0
description: Serves the nightly newcomer digests at /rss.xml
---

Builds the feed from the database. It has one item per run that found newcomers, naming each company under its fund with a link to its site. Newcomers more than an hour apart become separate items, so a fund let through by hand gets its own. The newest item is held back until an hour after its last newcomer.

Baseline imports and rows absorbed as baseline are left out, and the feed covers at most 90 days from the timeline start. It also defines the site's address and the Europe/Vienna day used by the statistics.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/routes/rss.xml/+server.ts](../../../../../../src/routes/rss.xml/%2Bserver.ts) | [src/server/api.ts](../../../../../../src/server/api.ts) | Queries newcomers | remult |
| [src/routes/rss.xml/+server.ts](../../../../../../src/routes/rss.xml/%2Bserver.ts) | [src/shared/timeline.ts](../../../../../../src/shared/timeline.ts) | Bounds the feed | import |
| [src/server/rss.ts](../../../../../../src/server/rss.ts) | [src/shared/funds.ts](../../../../../../src/shared/funds.ts) | Names funds | import |
