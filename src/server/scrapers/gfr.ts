import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://gfrfund.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// hubspot, with a portfolio module of its own: every company is a tile
// naming it over a line about it and linking its site, and the tile's
// classes are the filters the page's script builds from them — the sectors,
// lowercase with their spaces kept as &nbsp; ("consumer&nbsp;tech"), and
// "exited" for the companies the fund is out of. the stylesheet capitalizes
// the filters, so they are capitalized here; "other" says nothing.

const ITEM = /(?=<div class="room120_portfolio__item[\s"])/;
const CLASSES = /^<div class="room120_portfolio__item((?:\s[^"]*)?)"/;
const NAME = /class="room120_portfolio__title">([\s\S]*?)<\/h5>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const ACRONYMS = new Set(['ai', 'ar', 'vr', 'xr', 'b2b', 'b2c', 'saas', 'nft', 'web3']);
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "generative ai" -> "Generative AI", "media & brands" -> "Media & Brands"
const label = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ITEM).slice(1)) {
		// a tile ends with its link; the last would otherwise run on into the page
		const item = chunk.split('</a>')[0];
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the classes are split on real spaces; a sector's own spaces are &nbsp;
		const classes = (item.match(CLASSES)?.[1] ?? '')
			.split(' ')
			.map((c) => clean(c).toLowerCase())
			.filter(Boolean);
		const sectors = classes.filter((c) => c !== 'exited' && c !== 'other').map(label);
		companies.push({
			name,
			category: [...sectors, classes.includes('exited') ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('gfr: no companies on the portfolio page');
	}

	return companies;
}
