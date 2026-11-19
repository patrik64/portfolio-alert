---
type: C4 Component
title: Refresh runner
status: stable
groma:
  id: fetch-all
  parent: nightly-job
  code:
    - scanner: javascript
      file: scripts/fetch-all.mjs
  technology: Node.js script (scripts/fetch-all.mjs)
description: Asks the web app to refresh every fund and records what each gained
---

The workflow's refresh step, also run by hand. It reads the fund list from the fund registry file, leaving out paused funds, and local funds unless it is pointed at a local server. It then calls the web app's fetchFund method over HTTP five funds at a time and writes what each fund gained to fetch-results.json.

A full run stands down when most funds were refreshed in the last 12 hours, so a second run cannot clear the day's newcomers. Funds that failed are asked once more ten minutes later, and only a broad failure turns the run red. The options do three other jobs: `--only` names funds, `--dry-run` scrapes through probeFund without storing, and `--accept` lets a held flood in, from a local dev server only.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [scripts/fetch-all.mjs](../../../../../../scripts/fetch-all.mjs) | [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | Requests fund fetches | HTTPS POST /api/fetchFund and /api/probeFund |
| [scripts/fetch-all.mjs](../../../../../../scripts/fetch-all.mjs) | [src/server/api.ts](../../../../../../src/server/api.ts) | Checks recent refreshes | HTTPS GET /api/funds |
| [scripts/fetch-all.mjs](../../../../../../scripts/fetch-all.mjs) | [src/shared/funds.ts](../../../../../../src/shared/funds.ts) | Reads the fund list | reads the TypeScript file as text |
