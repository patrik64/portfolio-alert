---
type: C4 Component
title: Category tags
status: stable
groma:
  id: category-tags
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/tags.ts
  group: Publishing
  technology: TypeScript, regular expressions
description: Tells a category's sectors apart from stages, years, places and exits
---

A fund's category is whatever its page says about a company, so it mixes sectors with stages, cohorts, years, places, exits and the fund's own vehicles. This component splits a category into those kinds and folds spellings of one sector together (FinTech and Fintech; AI/ML and Artificial Intelligence). That way the statistics rank real sectors and count stages separately. The patterns know labels common across funds; one fund's own word for a programme can still pass for a sector.
