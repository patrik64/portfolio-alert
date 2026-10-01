import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.alsocapital.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the home page's investments are drawn twice, as a list, each
// company named over a line about it, carrying the categories the filter
// reads ("Space", "AI", "Scout") and linking its site, and as a grid of
// hexagons, each with the stage the company has reached ("Series A"), or
// "Acquired" for the ones the fund is out of. the list is read, its
// categories kept as tags, and the grid for the way out; a stage short of
// that is left out, as it moves on and a stored row would not follow it.
// the companies named only "Stealth" are left out.

const ITEM = /(?=<div\b[^>]*\bclass="investmentitem\b)/;
const SITE = /\bdata-href="([^"]*)"/;
const NAME = /class="paragraph-20px"[^>]*>([\s\S]*?)<\/div>/;
const CATEGORY = /fs-list-field="category"[^>]*>([\s\S]*?)<\/div>/g;
const HEXAGON = /(?=<div\b[^>]*\bclass="[^"]*\bhexa-item\b)/;
const HEXAGON_NAME = /class="companyname"[^>]*>([\s\S]*?)<\//;
const HEXAGON_STAGE = /class="seriestext"[^>]*>([\s\S]*?)<\//;
const OUT = /^(?:acquired|ipo|merged|exited)\b/i;
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

	// how the fund got out of a company, from the hexagons, by name
	const exits = new Map<string, string>();
	for (const hexagon of html.split(HEXAGON).slice(1)) {
		const name = clean(hexagon.match(HEXAGON_NAME)?.[1] ?? '');
		const stage = tag(hexagon.match(HEXAGON_STAGE)?.[1] ?? '');
		if (name && OUT.test(stage)) exits.set(name.toLowerCase(), stage);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ITEM).slice(1)) {
		const item = chunk.slice(0, chunk.indexOf('arrow-up-wrapper') + 1 || undefined);
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const went = exits.get(name.toLowerCase()) ?? '';
		const site = unescape(item.match(SITE)?.[1] ?? '').replace(/#$/, '').trim();
		companies.push({
			name,
			category: [...[...item.matchAll(CATEGORY)].map(([, category]) => tag(category)), went, went ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('alsocapital: no investments on the home page');
	}

	return companies;
}
