---
type: C4 Component
title: Fund registry
status: stable
groma:
  id: fund-registry
  parent: web-app
  code:
    - scanner: typescript
      file: src/shared/funds.ts
  group: Fund fetching
  technology: TypeScript
description: 'The list of tracked funds: slug, name, portfolio page and flags'
---

The canonical list of the 1059 tracked funds, kept in case-insensitive alphabetical order. Each entry gives the fund's slug, display name and portfolio page. Two optional flags say how it is fetched: `local` means the site refuses the deployment's addresses, so it is refreshed only from a laptop; `paused` means nothing fetches it until the flag comes off.

The scraper index, the pages, the RSS feed, the statistics and the companies API take fund names and links from it. The nightly job reads the same file as text to decide which funds to refresh and to name them in posts.
