import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://outwardvc.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the companies page is a list of tiles, the whole portfolio in
// the page, a tile a company with its name, an "Exited" mark on one the
// fund is out of, a line about it and its sectors ("Banking", "Data"),
// linking the company's page here. neither the tile nor that page links
// the company's own site, so a company links its page. the sectors are
// kept as tags, an exit with the Exited tag; the "Stealth" tiles name no
// one and are left out.

const TILE = /(?=<div class="tile tile--company">)/;
const PAGE = /<a class="tile__link[^"]*" href="([^"]*)"/;
const NAME = /<span class="linkline">([\s\S]*?)<\/span>/;
const EXITED = /class="text-sml tile__heading__exited"/;
const SECTOR = /<a class='noline tag[^']*' href='[^']*'>([\s\S]*?)<\/a>/g;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const tile of html.split(TILE).slice(1)) {
		const name = clean(tile.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const page = unescape(tile.match(PAGE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...[...tile.matchAll(SECTOR)].map(([, sector]) => tag(sector)), EXITED.test(tile) ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(page) ? page : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('outward: no companies on the companies page — the markup moved');
	}

	return companies;
}
