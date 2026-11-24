---
id: TASK-1
title: Hero landing page at the root
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T20:59:00Z'
updated_date: '2026-11-24T21:35:00Z'
labels: []
dependencies: []
references:
  - src/routes/+page.svelte
  - src/routes/+layout.svelte
modified_files:
  - src/routes/+page.svelte
  - src/routes/funds/+page.svelte
  - src/lib/assets/hero-wall.svg
  - src/lib/assets/hero-bell.svg
  - src/lib/assets/hero-briefcase.svg
  - src/routes/+layout.svelte
  - src/routes/newcomers/+page.svelte
  - src/routes/funds/[slug]/+page.svelte
  - src/routes/about/+page.svelte
  - README.md
  - groma/systems/portfolio-alert/containers/web-app/container.md
  - src/routes/statistics/+page.svelte
  - src/routes/search/+page.svelte
  - src/routes/timeline/+page.svelte
  - src/server/rss.ts
  - src/server/companies-api.ts
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The site opens straight onto the funds dashboard, a wall of 1,059 cards that says nothing about what the app is for. The owner wants a landing page at / instead, modelled on Tailwind UI's 'card with background image' hero (HeroSection7.svelte in the sibling tailwindui-svelte project): a hero card over an SVG background on the theme of portfolio and alert, leading to the app's four main sections. The funds dashboard that lives at / today has to move so the root is free.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The root page shows a hero card with an SVG background on the theme of portfolio and alert, a headline and a short description of the app
- [x] #2 The hero has buttons labelled newcomers, search, funds and statistics, each leading to that section
- [x] #3 The funds dashboard is served at /funds, and every in-app link that meant the dashboard points there
- [x] #4 The page reads well from phone width to desktop with no horizontal scrolling, and the background art is hidden from assistive technology
- [x] #5 svelte-check reports no errors and the production build succeeds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move the funds dashboard from src/routes/+page.svelte to src/routes/funds/+page.svelte (imports one level deeper, its own page title).
2. Write the new src/routes/+page.svelte after HeroSection7: a deep-teal hero card whose background is layered SVG art kept in src/lib/assets (a wall of portfolio tiles, a briefcase and a ringing bell from Heroicons, a few amber 'new' tiles), a two-line headline, a description carrying the fund count, and four buttons: newcomers, search, funds, statistics.
3. Layout: point the menu's funds entry at /funds, add funds to the header nav and re-tune the widths at which nav links drop out.
4. Repoint the 'dashboard' links on the newcomers, fund and about pages to /funds, and update the README's page list.
5. Check the page in the browser at phone, tablet and desktop widths; run svelte-check and the production build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned. The dashboard moved to /funds with git mv; the hero is the new src/routes/+page.svelte.
Background art: hero-wall.svg (a repeating wall of portfolio tiles, generated), hero-bell.svg (Heroicons bell-alert with rings centred on it) and hero-briefcase.svg (Heroicons briefcase), all in src/lib/assets; four amber tiles sit on the wall's grid and pulse, still under prefers-reduced-motion.
The newcomers button carries the live count of flagged newcomers as a corner badge, so its arrival moves nothing.
The header nav gained funds; its drop-out widths were re-measured (310/365/455/515/585/640).
Verified in Chrome against the dev server and a production preview: the hero at 320-1280px (no horizontal scroll, header one line at every threshold), the four buttons' targets by clicking, the badge matching the newcomers page (51), /funds listing 1,059 cards, the menu and about links at /funds. The two empty-state dashboard links (newcomers, fund page) were changed by the same edit and read in source only. svelte-check 0 errors, vite build ok.
groma: only the web app note's first paragraph could be changed through the CLI (edit --overview leaves text after the first list alone in 0.7.8), so the landing page is mentioned there rather than in the page list.

Owner asked for the header nav and the popup menu in the order newcomers, search, funds, statistics, timeline, about (the hero's button order first). The nav's drop-out widths became 350/405/455/525/585/640, measured again at each threshold; in the popup the dev download, bluesky, rss and github entries stay between timeline and about.

Owner asked to write the name 'portfolio-alert' (with a hyphen) on every page: tab titles, header wordmark, hero, meta description, about page, the RSS link's title. The wider wordmark moved the nav drop-out widths up 5px (355/410/460/530/590/645), measured again. The RSS feed's own title (src/server/rss.ts) and the companies API's markdown footer (src/server/companies-api.ts) still say 'portfolio alert'; they are not pages.

Then, at the owner's request, the RSS feed's title and the companies API's markdown footer also became 'portfolio-alert' (checked against the dev server: /rss.xml channel title, /api/v1/companies?format=md footer).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The root is now a landing page modelled on Tailwind UI's 'card with background image' hero: a deep-teal card over layered SVG art (a wall of portfolio tiles, the Heroicons bell with rings and briefcase, a few pulsing amber 'new' tiles), the headline 'portfolio-alert / discover new startups daily' with 'daily' in amber, a sentence carrying the fund count, and buttons to newcomers (with the live newcomer count), search, funds and statistics. The funds dashboard moved to /funds and every link to it followed; the header nav and the popup menu run newcomers, search, funds, statistics, timeline, about, with the nav's drop-out widths re-measured. The name is written 'portfolio-alert' on every page, in the RSS feed's title and in the companies API's markdown footer. Checked in Chrome from 320px to 1280px and in a production build; svelte-check and vite build pass. The last size change (second headline line one step smaller) was not looked at in the browser.
<!-- SECTION:FINAL_SUMMARY:END -->
