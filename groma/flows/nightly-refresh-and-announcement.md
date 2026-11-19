---
type: Groma Flow
title: Nightly refresh and announcement
groma:
  id: nightly-refresh-and-announcement
---

Every night GitHub Actions runs the nightly job. The refresh runner asks the web app to fetch each fund, five at a time. The scrape controller runs the fund's scraper, which reads its portfolio page, and stores only names it has not seen before, as newcomers, in one transaction. A flood of more than 30 is held back instead. The announcer then reads what each fund gained, fetches those companies from the web app, and posts them to Bluesky. The same newcomers appear on the newcomers page, the timeline and the RSS feed.

## Steps

| From | To | Action |
| --- | --- | --- |
| [GitHub Actions](../externals/github-actions.md) | [Refresh runner](../systems/portfolio-alert/containers/nightly-job/components/fetch-all.md) | Start the nightly refresh at 22:23 UTC |
| [Refresh runner](../systems/portfolio-alert/containers/nightly-job/components/fetch-all.md) | [Fund registry](../systems/portfolio-alert/containers/web-app/components/fund-registry.md) | Read the funds to refresh, leaving out local and paused ones |
| [Refresh runner](../systems/portfolio-alert/containers/nightly-job/components/fetch-all.md) | [Scrape controller](../systems/portfolio-alert/containers/web-app/components/scrape-controller.md) | Ask for each fund's fetch, five at a time |
| [Scrape controller](../systems/portfolio-alert/containers/web-app/components/scrape-controller.md) | [Fund scrapers](../systems/portfolio-alert/containers/web-app/components/fund-scrapers.md) | Run the fund's scraper within four minutes |
| [Fund scrapers](../systems/portfolio-alert/containers/web-app/components/fund-scrapers.md) | [Fund portfolio websites](../externals/fund-portfolio-websites.md) | Read the fund's portfolio page |
| [Scrape controller](../systems/portfolio-alert/containers/web-app/components/scrape-controller.md) | [Data model](../systems/portfolio-alert/containers/web-app/components/data-model.md) | Clear old newcomer flags and insert unseen companies as newcomers |
| [Data API](../systems/portfolio-alert/containers/web-app/components/data-api.md) | [Supabase Postgres](../externals/supabase-postgres.md) | Commit the fund's transaction |
| [GitHub Actions](../externals/github-actions.md) | [Newcomer announcer](../systems/portfolio-alert/containers/nightly-job/components/post-newcomers.md) | Start the announcement, even after failed fetches |
| [Newcomer announcer](../systems/portfolio-alert/containers/nightly-job/components/post-newcomers.md) | [Refresh runner](../systems/portfolio-alert/containers/nightly-job/components/fetch-all.md) | Read what each fund gained from fetch-results.json |
| [Newcomer announcer](../systems/portfolio-alert/containers/nightly-job/components/post-newcomers.md) | [Data API](../systems/portfolio-alert/containers/web-app/components/data-api.md) | Fetch the new companies of those funds |
| [Newcomer announcer](../systems/portfolio-alert/containers/nightly-job/components/post-newcomers.md) | [Bluesky](../externals/bluesky.md) | Post the digest, as a thread when it is long |
