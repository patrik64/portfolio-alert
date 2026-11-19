---
type: C4 Component
title: Scrape controller
status: stable
groma:
  id: scrape-controller
  parent: web-app
  code:
    - scanner: typescript
      file: src/shared/ScrapeController.ts
  group: Fund fetching
  technology: remult BackendMethods (TypeScript)
description: Runs a fund's scrape and stores what it found
---

The server methods the dashboard and the nightly job call over HTTP through the data API.

`fetchFund` runs one fund's scraper within four minutes, then, in one transaction, clears the fund's previous newcomer flags and inserts the names it has not stored before. On a fund's first fetch these are baseline rows; later they are newcomers. It never updates or deletes a stored company. More than 30 new names at once are held back with an error, unless a local dev server accepts them as newcomers or as baseline. It refuses paused funds, records the outcome (counts, last fetch, last error) on the fund, and returns what was gained for the nightly job's results.

`probeFund` runs the scrape alone, storing nothing. Smaller methods serve the pages: cross-fund search, the company count, and clearing the newcomers page.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | [src/server/scrapers/index.ts](../../../../../../src/server/scrapers/index.ts) | Runs fund scrapers | dynamic import, four-minute limit |
| [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | [src/shared/Company.ts](../../../../../../src/shared/Company.ts) | Stores new companies | remult repositories in a transaction |
