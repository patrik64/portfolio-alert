---
type: C4 System
title: GitHub Actions
description: Runs the nightly job on a schedule
status: stable
groma:
  id: github-actions
  technology: GitHub Actions workflow (daily-fetch.yml)
---

The daily-fetch workflow runs the nightly job on an ubuntu runner at 22:23 UTC. The maintainer can also start it by hand to force a refresh, announce current newcomers, or take back a Bluesky post. Runs share one concurrency group, and the workflow holds the Bluesky app password as a repository secret.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [github-actions](github-actions.md) | [scripts/fetch-all.mjs](../../scripts/fetch-all.mjs) | Runs nightly | scheduled workflow step |
| [github-actions](github-actions.md) | [scripts/post-newcomers.mjs](../../scripts/post-newcomers.mjs) | Runs after the refresh | workflow step |
| [github-actions](github-actions.md) | [scripts/delete-bluesky-post.mjs](../../scripts/delete-bluesky-post.mjs) | Runs on request | workflow step with delete_post input |
