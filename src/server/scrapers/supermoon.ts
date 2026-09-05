import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://supermooncapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, but this grid is server-rendered into the page rather than hidden in
// the binary chunks the fund's other sections use. each tile carries the
// company's name as its logo's alt text, then three spans in order — the
// sector, the name again, and what the company does — and a link out.
//
// framer emits the same grid four times over, once per breakpoint, so every
// company appears four times and only the first is kept.
//
// the fund writes its companies in capitals ("ENSODATA", "BIG HEALTH"). that
// is left as written: recasing would have to guess, and would get EnsoData
// wrong either way.

const CARD = /<img src="https:\/\/framerusercontent\.com\/images\/[^"]*" alt="([^"]*)"/g;
const SPAN = /<span[^>]*>([^<]*)<\/span>/g;
const SITE = /<a href="(https?:\/\/[^"]+)" target="_blank"/;
const CARD_MAX = 4000;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
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

	const cards = [...html.matchAll(CARD)].map((m) => ({ at: m.index, name: clean(m[1]) }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < cards.length; i++) {
		const { at, name } = cards[i];
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const end = Math.min(cards[i + 1]?.at ?? at + CARD_MAX, at + CARD_MAX);
		const card = html.slice(at, end);
		const spans = [...card.matchAll(SPAN)]
			.map((m) => clean(m[1]))
			.filter((s) => s && s !== 'Visit Site');

		companies.push({
			name,
			// the sector leads the tile, above the name it repeats
			category: spans[1] === name ? (spans[0] ?? '') : '',
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('supermoon: no companies on the portfolio page');
	}

	return companies;
}
