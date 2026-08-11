# portfolio-alert

Up-to-date information about companies backed by 45 venture capital and private
equity funds. Scrapes each fund's public portfolio page, stores companies in
Supabase (postgres), and highlights newcomers — companies that appeared in a
fund's portfolio since the last fetch.

Built with SvelteKit 2, Svelte 5, remult and Tailwind CSS 4.

## Try

live at https://portfolio-alert.vercel.app

## Pages

- **dashboard** (`/`) — one card per fund with company count, newcomer badge and
  last-fetch time; the whole card links to the fund's detail page. A **fetch
  all** button runs every scraper (5 at a time), and each card has its own
  **refresh** button.
- **fund detail** (`/funds/[slug]`) — all companies of a fund with search over
  name and category; the fund name links to the fund's own portfolio page.
- **newcomers** (`/newcomers`) — companies found by the latest fetch that were
  not in the database before, grouped by fund. The very first fetch of a fund is
  a baseline import and is not counted as newcomers. A **clean** button
  acknowledges the current newcomers and empties the list until the next fetch
  finds something new.
- **search** (`/search`) — searches all companies across every fund by name or
  category (server-side, debounced), listing name, category, fund and first-seen
  date.
- **download** (`/download`) — downloads a JSON file with all companies grouped
  by fund (name, category, url and first-seen date per company).

Every company row shows when the company was first encountered ("first seen").

## Setup

```sh
pnpm install
```

Put the Supabase postgres connection string in `.env`:

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres
```

Without `DATABASE_URL`, remult falls back to JSON files in `./db/` — handy for
local experiments. Tables are created automatically on first use.

```sh
pnpm dev             # start the dev server
pnpm check           # typecheck (svelte-check)
pnpm test-scrapers   # smoke-test all 45 scrapers outside the app
pnpm test-scrapers townhall sequoia   # ...or just some of them
pnpm build           # production build
```

## Deployment

The app is deployed on Vercel at https://portfolio-alert.vercel.app
(`DATABASE_URL` is configured as a sensitive environment variable on the
Vercel project for Preview and Production).

```sh
vercel          # preview deploy
vercel --prod   # production deploy
```

The deployed app and local dev share the same database. Full fetch-alls are
best run locally: the slowest scrapers take minutes and can exceed serverless
function duration limits.

## Scrapers

The registry in `src/server/scrapers/index.ts` maps fund slugs (see `src/shared/funds.ts`) to
scraper implementations. Techniques vary per fund — server-rendered HTML,
paginated listings, WordPress/GraphQL/Typesense APIs — and some scrapers visit
each company's detail page to pick up sector and website (batched; e.g.
Sequoia, Insight, Fil Rouge).

Company identity is `(fund, normalized name)` — urls and categories are too
inconsistent across funds to key on. Scrapers break when sites redesign; a
failing fund shows its error on the dashboard card while the other fetches
continue.
