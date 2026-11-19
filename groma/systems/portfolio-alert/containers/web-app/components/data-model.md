---
type: C4 Component
title: Data model
status: stable
groma:
  id: data-model
  parent: web-app
  code:
    - scanner: typescript
      file: src/shared/Company.ts
      symbol: Company
    - scanner: typescript
      file: src/shared/Fund.ts
      symbol: Fund
  group: Data access
  technology: remult entities (TypeScript)
description: The Fund and Company records kept in the database
---

Two remult entities, shared by the server and the browser.

- **Fund:** one per fetched fund, with its company and newcomer counts, last fetch time and last error.
- **Company:** one per company a fund lists, keyed by fund and normalized name. It holds the category and link as the fund gave them, when it was first seen, and whether it is a newcomer from the latest fetch or part of a baseline import.

Both are readable through the data API; only server code writes them.
