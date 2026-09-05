import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://tcg.co/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-written page: each company is a tile linking straight out, built from
// a background picture and — for most — a logo laid over it. the alt text on
// those images names the company, and the tile's own id is the fund's short
// name for it, which stands in where no image is described.
//
// no sectors and no exit markers anywhere, so categories are empty.

const TILE = /<a href="(https?:\/\/[^"]+)"[^>]*>\s*<div class="col-3 comp">([\s\S]*?)<\/a>/g;
const ID = /class="compContain[^"]*" id="([^"]+)"/;
const ALT = /alt="([^"]+)"/;

const capitalize = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, tile] of html.matchAll(TILE)) {
		const alt = (tile.match(ALT)?.[1] ?? '').trim();
		const name = alt || capitalize((tile.match(ID)?.[1] ?? '').replace(/-/g, ' '));
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('tcg: no companies on the portfolio page');
	}

	return companies;
}
