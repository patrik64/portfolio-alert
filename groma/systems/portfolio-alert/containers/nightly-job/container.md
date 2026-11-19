---
type: C4 Container
title: Nightly job
status: stable
groma:
  id: nightly-job
  parent: portfolio-alert
  technology: Node.js scripts (no dependencies), run by GitHub Actions
description: Refreshes every fund each night and announces the newcomers
---

Plain Node command-line scripts that run as steps of the daily-fetch GitHub Actions workflow, and can also be run by hand from a laptop.

The refresh step asks the deployed web app to fetch each fund over HTTP and records what each fund gained. The announcement step turns those results into a Bluesky post or thread. A third script takes back a wrong post. The scripts never touch the database directly: everything goes through the web app's API.
