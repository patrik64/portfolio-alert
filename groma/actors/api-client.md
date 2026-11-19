---
type: C4 Actor
title: API client
description: Queries the public companies API
status: stable
groma:
  id: api-client
---

A developer's script or tool that reads the public, read-only companies API at /api/v1/companies: recent newcomers in a window, or a fund's whole catalogue filtered by name, category or exit status, as JSON or a Markdown list of links.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [api-client](api-client.md) | [src/routes/api/v1/companies/+server.ts](../../src/routes/api/v1/companies/%2Bserver.ts) | Queries companies | HTTPS GET, JSON or Markdown |
