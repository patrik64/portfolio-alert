# portfolio-alert

Up-to-date information about companies backed by 458 venture capital and private
equity funds. Scrapes each fund's public portfolio page, stores companies in
Supabase (postgres), and highlights newcomers — companies that appeared in a
fund's portfolio since the last fetch.

Built with SvelteKit 2, Svelte 5, remult and Tailwind CSS 4.

## Try

live at https://portfolio-alert.vercel.app

## Bluesky

https://bsky.app/profile/portfolio-alert.bsky.social

## RSS

https://portfolio-alert.vercel.app/rss.xml

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
- **timeline** (`/timeline`) — every company first seen since the nightly
  refresh went live (20 Aug 2026), grouped by the day it appeared and then by
  fund, newest day first, in collapsible sections. The start date lives in
  `src/shared/timeline.ts`.
- **download** (`/download`) — downloads a JSON file with all companies grouped
  by fund (name, category, url and first-seen date per company).
- **about** (`/about`) — what the app does and how the pages fit together.
- **rss** (`/rss.xml`) — the nightly newcomer digests as a feed: one item per
  night that found some, naming every company under its fund.

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
pnpm test-scrapers   # smoke-test all 458 scrapers outside the app
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

The deployed app and local dev share the same database. A fetch-all started
from the browser is best run locally — the slowest scrapers take minutes and can
exceed serverless function duration limits — while the nightly job below drives
production one fund at a time, which stays inside them.

## Nightly refresh

`.github/workflows/daily-fetch.yml` refreshes every fund at 1:13am UTC (the
small hours in Vienna); the workflow can also be run by hand from the Actions
tab.

```sh
pnpm fetch-all                       # refresh every fund against production
pnpm fetch-all --only=a16z,gv        # ...or just some of them
pnpm post-newcomers --dry-run        # compose the bluesky post, post nothing
pnpm post-newcomers                  # ...and publish it
pnpm post-newcomers --current        # ...covering the whole newcomers page
pnpm post-newcomers --check          # prove the app password still works
```

`scripts/fetch-all.mjs` calls the same `fetchFund` endpoint the dashboard's
buttons use, five funds at a time, and leaves what each fund gained in
`fetch-results.json`. A single stubborn site (Speedinvest refuses datacenter
addresses) does not turn the night red — only a broad failure does.

`scripts/post-newcomers.mjs` then announces the finds on Bluesky as
[@portfolio-alert.bsky.social](https://bsky.app/profile/portfolio-alert.bsky.social),
naming every company and linking it to its own site. A long list continues into
a thread, and a flood day turns into a count per fund instead. Quiet nights stay
quiet. It needs one repository secret:

```sh
gh secret set BLUESKY_APP_PASSWORD   # an app password, never the account password
```

Without that secret the step is a no-op, so the refresh keeps working on its
own. Running the workflow by hand offers a **skip the refresh, just announce the
current newcomers** switch, for announcing finds that a run has already
recorded.

The same digests are served as an RSS feed at `/rss.xml`, straight from the
database and covering the same stretch as the timeline: one item per night
that found newcomers, with the companies named under their funds and linked to
their sites. A night still being written is
held back until it has settled, so readers never cache a half-announced one.

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
