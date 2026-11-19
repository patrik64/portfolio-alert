---
type: Groma Flow
title: Follow the newcomers
groma:
  id: follow-the-newcomers
---

People learn about newcomers without visiting each fund's site. A portfolio watcher subscribes to the RSS feed, which the web app builds from the stored newcomers, one item per night. A developer queries the public companies API for a window of recent newcomers or a fund's whole catalogue. Both read through the data API from the database, and the CDN caches the answers.

## Steps

| From | To | Action |
| --- | --- | --- |
| [Portfolio watcher](../actors/portfolio-watcher.md) | [RSS feed](../systems/portfolio-alert/containers/web-app/components/rss-feed.md) | Poll /rss.xml for the nightly digests |
| [RSS feed](../systems/portfolio-alert/containers/web-app/components/rss-feed.md) | [Data API](../systems/portfolio-alert/containers/web-app/components/data-api.md) | Query newcomers since the timeline start, without baseline rows |
| [API client](../actors/api-client.md) | [Public companies API](../systems/portfolio-alert/containers/web-app/components/companies-api.md) | Ask /api/v1/companies for recent newcomers or a fund's catalogue |
| [Public companies API](../systems/portfolio-alert/containers/web-app/components/companies-api.md) | [Data API](../systems/portfolio-alert/containers/web-app/components/data-api.md) | Run the filtered query, one entry per company |
| [Data API](../systems/portfolio-alert/containers/web-app/components/data-api.md) | [Supabase Postgres](../externals/supabase-postgres.md) | Read the stored companies |
