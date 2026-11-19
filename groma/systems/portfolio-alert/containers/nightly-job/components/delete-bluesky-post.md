---
type: C4 Component
title: Post retractor
status: stable
groma:
  id: delete-bluesky-post
  parent: nightly-job
  code:
    - scanner: javascript
      file: scripts/delete-bluesky-post.mjs
  group: Bluesky announcing
  technology: Node.js script over AT Protocol XRPC (scripts/delete-bluesky-post.mjs)
description: Takes back a wrong Bluesky announcement
---

Deletes one post from the portfolio-alert Bluesky account, given its URL or record key. It runs when the maintainer starts the workflow with the take-back input, so the app password never leaves the runner. It is used when an announcement turns out wrong, such as a redesigned page's back catalogue counted as newcomers.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [delete-bluesky-post](delete-bluesky-post.md) | [bluesky](../../../../../externals/bluesky.md) | Deletes posts | AT Protocol XRPC deleteRecord |
