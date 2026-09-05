import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.rallyventures.com/investments/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the whole portfolio in the page: each company is a tile whose
// name is the link, with everything else hidden beside it until the tile is
// opened — a logo, a line about the company, its address and its social
// accounts.
//
// the sector and how the investment ended are slugs in the tile's class list,
// and the two filter menus above the grid spell those slugs out, so the labels
// come from the page rather than being guessed at. "active" is every company
// the fund still holds and is dropped; a company can be both acquired and
// listed, and the fund marks it as both.
//
// a third of them keep no address — the ones bought long enough ago that there
// is nothing left to link to.

const ITEM = '<div class="col-6 col-lg-3 mt-32 mt-lg-48 source investment-wrap ';
const NAME = /data-source="title"[^>]*>\s*([^<]*?)\s*<\/a>/;
const SITE = /<a href="(https?:\/\/[^"]*)"[^>]*data-source="link"/;
const OPTION = /<option value="((?:category|status)-[^"]*)"[^>]*>([^<]*)<\/option>/g;
const STATUS_SLUG = /^status-/;
// the status of every company the fund still holds
const HELD = 'status-active';

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
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const labels = new Map(
		[...html.matchAll(OPTION)].map((m) => [m[1], clean(m[2])] as [string, string])
	);
	if (labels.size === 0) {
		throw new Error('rally: the filters spell out no sectors to read the tiles against');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const slugs = item
			.slice(0, item.indexOf('"'))
			.split(/\s+/)
			.filter((s) => s !== HELD && labels.has(s));
		companies.push({
			name,
			category: [
				...slugs.filter((s) => !STATUS_SLUG.test(s)),
				...slugs.filter((s) => STATUS_SLUG.test(s))
			]
				.map((s) => labels.get(s) as string)
				.join(', '),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('rally: no companies on the investments page');
	}

	return companies;
}
