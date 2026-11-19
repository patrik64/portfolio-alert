---
type: C4 Component
title: Timeline start
status: stable
groma:
  id: timeline-start
  parent: web-app
  code:
    - scanner: typescript
      file: src/shared/timeline.ts
      symbol: TIMELINE_START
  group: Publishing
  technology: TypeScript
description: The date the record of newcomers begins
---

Fixes 20 August 2026, when the nightly refresh went live, as the start of the newcomer record. The RSS feed, the statistics, the companies API and the timeline page count newcomers only from this date.
