import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://salt.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro, rendered on the server. the page holds the portfolio twice over: a
// grid whose cards carry everything as data attributes, and a run of
// spotlights above it written as ordinary markup.
//
// every spotlight is also a card, but under a shorter name — Loop for Loop
// Returns, Casca for Cascading AI — so matching the two by name alone counts
// four companies twice. they are told apart by the address instead, and the
// grid goes first, so a company keeps the fuller name and a spotlight can only
// add one the grid has left out.
//
// what a card says: the industries the fund files the company under, the stage
// it is at, and a status that names the buyer where there was one — "Exited to
// Walmart", or the ticker for the one that listed. "Active" and "N/A" say
// nothing and are dropped.

const CARD = /<li data-pf-card([^>]*)>/g;
const ATTR = (name: string) => new RegExp(`data-${name}="([^"]*)"`);
const SPOTLIGHTS = 'data-pf-view="spotlights"';
const GRID = 'data-pf-view="all"';
const ARTICLE = /<article/g;
const FIELD = /<dt[^>]*>([^<]*)<\/dt>\s*<dd[^>]*>([^<]*)<\/dd>/g;
const VISIT = /<a href="(https?:\/\/[^"]+)"[^>]*aria-label="Visit /;
// the status of a company the fund still holds, and the stage of one it files
// under none
const HELD = /^active$/i;
const NO_STAGE = /^n\/a$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const seenLinks = new Set<string>();
	// the same link written with and without its trailing slash
	const linkKey = (url: string) => url.replace(/\/+$/, '').toLowerCase();
	const add = (name: string, tags: string[], url: string) => {
		const listed = clean(name);
		if (!listed || seen.has(listed.toLowerCase())) return;
		if (url && seenLinks.has(linkKey(url))) return;
		seen.add(listed.toLowerCase());
		if (url) seenLinks.add(linkKey(url));
		companies.push({ name: listed, category: tags.filter(Boolean).join(', '), url });
	};

	for (const m of html.matchAll(CARD)) {
		const card = m[1];
		const at = (name: string) => clean(card.match(ATTR(name))?.[1] ?? '');

		const stage = at('stage');
		const status = at('statuslabel');
		add(
			at('cname'),
			[at('industry'), NO_STAGE.test(stage) ? '' : stage, HELD.test(status) ? '' : status],
			at('url')
		);
	}

	// the spotlights sit above the grid and are written out in full
	const spotlights = html.slice(html.indexOf(SPOTLIGHTS), html.indexOf(GRID));
	const starts = [...spotlights.matchAll(ARTICLE)].map((m) => m.index);
	for (const [i, start] of starts.entries()) {
		const article = spotlights.slice(start, starts[i + 1] ?? spotlights.length);

		const fields = new Map([...article.matchAll(FIELD)].map((f) => [clean(f[1]), clean(f[2])]));
		const status = fields.get('Status') ?? '';
		add(
			fields.get('Portfolio Company') ?? '',
			[fields.get('Industry') ?? '', HELD.test(status) ? '' : status],
			article.match(VISIT)?.[1] ?? ''
		);
	}

	if (companies.length === 0) {
		throw new Error('salt: no companies on the portfolio page');
	}

	return companies;
}
