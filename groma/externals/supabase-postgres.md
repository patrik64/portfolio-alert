---
type: C4 System
title: Supabase Postgres
description: The app's database, hosted by Supabase
status: stable
groma:
  id: supabase-postgres
  technology: PostgreSQL via Supabase's transaction-mode pooler
---

Stores every fund's refresh status and every company each fund lists, with first-seen times and newcomer and baseline flags. It is the project's own data store, hosted by Supabase rather than running from this repository, so it appears here as an outside system. Local development and production share it. Without DATABASE_URL, remult falls back to JSON files in ./db for local experiments.
