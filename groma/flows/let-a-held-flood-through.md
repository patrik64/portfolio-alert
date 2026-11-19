---
type: Groma Flow
title: Let a held flood through
groma:
  id: let-a-held-flood-through
---

When a fund's page suddenly lists more than 30 unseen companies, usually a redesign showing its back catalogue, the fetch stores nothing and fails with a note, night after night. The maintainer checks the names, then runs the refresh runner from a laptop against a local dev server with --accept. The scrape controller stores the companies as newcomers when the flood is real, or as baseline, which keeps them out of the newcomers, the timeline, the feed and the next Bluesky post. Newcomers let through by hand are announced by starting the workflow by hand.

## Steps

| From | To | Action |
| --- | --- | --- |
| [Maintainer](../actors/maintainer.md) | [Refresh runner](../systems/portfolio-alert/containers/nightly-job/components/fetch-all.md) | Run the held fund with --accept=newcomers or --accept=baseline |
| [Refresh runner](../systems/portfolio-alert/containers/nightly-job/components/fetch-all.md) | [Scrape controller](../systems/portfolio-alert/containers/web-app/components/scrape-controller.md) | Ask a local dev server to fetch the fund, accepting the flood |
| [Scrape controller](../systems/portfolio-alert/containers/web-app/components/scrape-controller.md) | [Fund scrapers](../systems/portfolio-alert/containers/web-app/components/fund-scrapers.md) | Run the fund's scraper |
| [Fund scrapers](../systems/portfolio-alert/containers/web-app/components/fund-scrapers.md) | [Fund portfolio websites](../externals/fund-portfolio-websites.md) | Read the redesigned page |
| [Scrape controller](../systems/portfolio-alert/containers/web-app/components/scrape-controller.md) | [Data model](../systems/portfolio-alert/containers/web-app/components/data-model.md) | Insert the companies as newcomers or as baseline |
| [Maintainer](../actors/maintainer.md) | [GitHub Actions](../externals/github-actions.md) | Start the workflow with announce_only for that fund, when they were newcomers |
