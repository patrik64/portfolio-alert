import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.meron.vc';
const PAGE_URL = `${BASE_URL}/`;
const BATCH_SIZE = 8;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, redesigned in september 2026: the front page draws the whole
// roster as a grid of logo tiles, each named and linked to a page of the
// fund's own, and those pages say the rest — the company's address as a
// link whose text is its bare domain (which is what tells it apart from the
// press links beside it), and "Acquired by ..." on the ones the fund is out
// of. no sectors anywhere any more.

const TILE = /href="\/companies\/([^"]+)">[\s\S]{0,900}?font-semibold[^>]*>([^<]+)</g;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*target="_blank"[^>]*>([^<]*?)(?:<!-- -->)?\s*↗/g;
const ACQUIRED = /Acquired by(?:\s*<!-- -->)?\s*([^<]*)</;

const clean = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchPage(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchPage(PAGE_URL);

	const tiles = [...html.matchAll(TILE)].map(([, slug, name]) => ({ slug, name: clean(name) }));
	if (tiles.length === 0) {
		throw new Error('meron: no company tiles on the page');
	}

	const details = new Map<string, { url: string; acquired: string }>();
	for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
		await Promise.all(
			tiles.slice(i, i + BATCH_SIZE).map(async (tile) => {
				try {
					const page = await fetchPage(`${BASE_URL}/companies/${tile.slug}`);
					// the company's own link is the one written as its bare domain
					const site =
						[...page.matchAll(SITE)].find(([, href, text]) =>
							href.includes(clean(text).replace(/\s/g, ''))
						)?.[1] ?? '';
					details.set(tile.slug, {
						url: site,
						acquired: clean(page.match(ACQUIRED)?.[1] ?? '')
					});
				} catch {
					// the tile already names the company; it just goes without the rest
				}
			})
		);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const tile of tiles) {
		if (!tile.name || seen.has(tile.name.toLowerCase())) continue;
		seen.add(tile.name.toLowerCase());

		const detail = details.get(tile.slug) ?? { url: '', acquired: '' };
		companies.push({
			name: tile.name,
			category: detail.acquired
				? `Acquired by ${detail.acquired}, Exited`
				: '',
			url: detail.url
		});
	}

	if (companies.length === 0) {
		throw new Error('meron: no companies in the portfolio list');
	}

	return companies;
}
