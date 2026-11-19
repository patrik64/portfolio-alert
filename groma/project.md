---
type: Groma Project
title: portfolio-alert
groma:
  profile: architecture
description: Tracks the companies 1059 VC and PE funds back, and announces the new ones
---

portfolio-alert scrapes the public portfolio pages of 1059 venture capital and private equity funds every night, stores the companies in Postgres, and highlights newcomers: companies that appeared in a fund's portfolio since the last fetch. The newcomers are published on the web app, in an RSS feed, through a public API, and as Bluesky posts.

The architecture has two containers. The **web app** (SvelteKit on Vercel) serves the pages and APIs and runs the scrapers. The **nightly job** (Node scripts on GitHub Actions) asks the web app to refresh each fund and then announces the night's finds on Bluesky. Live at https://portfolio-alert.vercel.app.
