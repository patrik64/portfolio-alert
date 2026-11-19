---
type: C4 System
title: portfolio-alert
status: stable
groma:
  id: portfolio-alert
description: Finds the companies VC and PE funds newly back and publishes them
---

Keeps an up-to-date record of the companies listed on 1059 funds' public portfolio pages, and tells people which ones are new.

Every night the system reads each fund's page. A fund's first fetch is a quiet baseline import. Later fetches flag only names not seen before as newcomers, and a fetch never updates or deletes a stored company. A sudden flood of more than 30 new names is held back, because it usually means a redesigned page listing its back catalogue. Newcomers then reach people through the web app's newcomers, timeline and statistics pages, the RSS feed, the public companies API, and Bluesky posts.

The scope is the funds in the fund registry. Funds whose sites refuse datacenter addresses are fetched only from a laptop, and funds with nothing to read are paused.
