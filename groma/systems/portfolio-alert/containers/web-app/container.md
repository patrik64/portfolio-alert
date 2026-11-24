---
type: C4 Container
title: Web app
status: stable
groma:
  id: web-app
  parent: portfolio-alert
  technology: SvelteKit 2, Svelte 5, remult, TypeScript; deployed on Vercel
description: Serves the pages and APIs, and runs the fund scrapers
---

The SvelteKit application at portfolio-alert.vercel.app, the only part that touches the database. Its root is a landing page that leads to the pages below.

- **Pages** (Svelte, outside the scan): the fund dashboard, a fund's companies, newcomers, timeline, search, statistics and about. They read through the remult data API.
- **Fund fetching:** a fetch, started from the dashboard or by the nightly job's HTTP calls, runs one fund's scraper inside a Vercel function and stores what it finds.
- **Publishing:** the RSS feed, the public companies API, the statistics totals and the dev-only JSON export are server routes over the same data.

Local development runs the same app with vite against the shared database. A local dev server is also how funds marked local are fetched, and how a held flood is let through.
