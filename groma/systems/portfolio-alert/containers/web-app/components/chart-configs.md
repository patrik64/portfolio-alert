---
type: C4 Component
title: Chart configuration
status: stable
groma:
  id: chart-configs
  parent: web-app
  code:
    - scanner: typescript
      file: src/lib/charts/configs.ts
    - scanner: typescript
      file: src/lib/charts/palette.ts
      symbol: PALETTE
  group: Publishing
  technology: Chart.js
description: Bar-chart settings and palette for the statistics page
---

Builds the Chart.js configurations the statistics page draws: ranked horizontal bars, columns per day, and columns per month, all in one colour with each bar's count written on it. The page itself is a Svelte file outside the scan.
