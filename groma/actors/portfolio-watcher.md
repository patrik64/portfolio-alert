---
type: C4 Actor
title: Portfolio watcher
description: Follows which companies VC and PE funds back
status: stable
groma:
  id: portfolio-watcher
---

Anyone keeping track of what venture capital and private equity funds invest in, such as founders, investors, analysts or journalists. They browse the web app's pages (the fund dashboard, a fund's companies, the newcomers, timeline, search and statistics) and subscribe to the RSS feed of nightly newcomer digests. They need to know which companies newly appeared in a fund's portfolio and when.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [portfolio-watcher](portfolio-watcher.md) | [src/server/api.ts](../../src/server/api.ts) | Browses funds and companies | Svelte pages over remult REST, HTTPS |
| [portfolio-watcher](portfolio-watcher.md) | [src/routes/rss.xml/+server.ts](../../src/routes/rss.xml/%2Bserver.ts) | Subscribes to digests | RSS over HTTPS |
| [portfolio-watcher](portfolio-watcher.md) | [src/routes/statistics.json/+server.ts](../../src/routes/statistics.json/%2Bserver.ts) | Views monthly statistics | statistics page, JSON over HTTPS |
| [portfolio-watcher](portfolio-watcher.md) | [bluesky](../externals/bluesky.md) | Follows announcements | Bluesky app |
