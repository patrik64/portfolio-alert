---
type: C4 Component
title: Newcomer announcer
status: stable
groma:
  id: post-newcomers
  parent: nightly-job
  code:
    - scanner: javascript
      file: scripts/post-newcomers.mjs
  group: Bluesky announcing
  technology: Node.js script over AT Protocol XRPC (scripts/post-newcomers.mjs)
description: Announces the night's newcomers on Bluesky
---

The workflow's announcement step, which runs even when the refresh reported failures. It reads the refresh runner's results, or with `--current` the whole newcomers page, optionally limited to some funds. It asks the web app's API which companies those funds gained, then composes a post naming each company under its fund with links to their sites.

A long list continues into a thread of up to three posts, and a flood day becomes a count per fund. It signs in as portfolio-alert.bsky.social with an app password. Without the password it does nothing, and `--dry-run` and `--check` let it be tried safely.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [scripts/post-newcomers.mjs](../../../../../../scripts/post-newcomers.mjs) | [scripts/fetch-all.mjs](../../../../../../scripts/fetch-all.mjs) | Reads refresh results | fetch-results.json |
| [scripts/post-newcomers.mjs](../../../../../../scripts/post-newcomers.mjs) | [src/server/api.ts](../../../../../../src/server/api.ts) | Reads new companies | HTTPS GET /api/companies and /api/funds |
| [scripts/post-newcomers.mjs](../../../../../../scripts/post-newcomers.mjs) | [src/shared/funds.ts](../../../../../../src/shared/funds.ts) | Reads fund names | reads the TypeScript file as text |
| [post-newcomers](post-newcomers.md) | [bluesky](../../../../../externals/bluesky.md) | Posts announcements | AT Protocol XRPC createRecord |
