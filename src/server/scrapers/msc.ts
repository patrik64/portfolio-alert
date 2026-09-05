import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://msc.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the fund calls its companies partners and writes each one's name
// into the tile as an attribute, so nothing has to be read out of a logo.
//
// six of the thirty-four tiles are companies it has not announced. the fund
// says so itself — the link is titled Stealth and goes nowhere — and gives
// them the first two letters of a name instead, which is how two of them come
// to be called Ar. they are left out, as unannounced companies are elsewhere,
// and that is also what keeps the two Ars from becoming one.
//
// five tiles carry the word Exit, which is the whole of what the fund says
// about a company's ending and is kept as it writes it.

const TILE = /<li class="partner-item"[^>]*\bdata-title="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g;
const LINK = /<a\b[^>]*?\bhref="([^"]*)"[^>]*?\btitle="([^"]*)"/;
const LABEL = /<span class="category">([\s\S]*?)<\/span>/;
// the fund's own word for a company it has not named yet
const UNANNOUNCED = /^stealth$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, title, tile] of html.matchAll(TILE)) {
		const link = tile.match(LINK);
		const url = link?.[1] ?? '';
		if (UNANNOUNCED.test(clean(link?.[2] ?? '')) || !/^https?:\/\//i.test(url)) continue;

		const name = clean(title);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: clean(tile.match(LABEL)?.[1] ?? ''),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('msc: no companies among the partners');
	}

	return companies;
}
