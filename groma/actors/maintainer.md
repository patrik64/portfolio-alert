---
type: C4 Actor
title: Maintainer
description: Keeps the scrapers working and the data honest
status: stable
groma:
  id: maintainer
---

The project's owner. Adds funds and repairs scrapers when a fund's site changes, runs fetches by hand against a local dev server (funds marked local, or a held flood let through with --accept), starts the nightly workflow by hand to announce or take back a Bluesky post, and fixes data with one-off scripts.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [maintainer](maintainer.md) | [scripts/fetch-all.mjs](../../scripts/fetch-all.mjs) | Runs fetches by hand | Node CLI, often against a local dev server |
| [maintainer](maintainer.md) | [github-actions](../externals/github-actions.md) | Starts runs by hand | workflow_dispatch |
| [maintainer](maintainer.md) | [src/routes/download/+server.ts](../../src/routes/download/%2Bserver.ts) | Exports every company | local dev server only |
