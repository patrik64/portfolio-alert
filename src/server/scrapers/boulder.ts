import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.boulderventures.com';
// /whatwevedone has answered 404 since the move off squarespace on 2026-11-16
const PAGE_URL = `${BASE_URL}/what-weve-done`;
const BATCH_SIZE = 4;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow since 2026-11-16: the "what we've done" page is a grid of tiles, a
// company each, filed under one of the fund's four fields ("IT Services",
// "Life Sciences") and, on the tile's hover face, its sector ("Executive
// Intelligence"), whether the fund is still in it ("Active") or out
// ("Realized") and its name, the tile linking the company's page on the
// fund's site, where its own site is the "visit website" button. the field
// and the sector are kept as tags, a realized company with the Exited tag. the
// pages are asked for a few at a time, and one that will not load leaves its
// company linking to it.

// the move renamed a few companies the old gallery captioned ("OnKure" is now
// "OnKure Therapeutics", "Cogent" is "Cogent Communications"), and each is kept
// under the name it was stored as, so it is not taken for a new company.
const STORED_AS: Record<string, string> = {
	althea: 'Althea Technologies',
	'cogent communications': 'Cogent',
	finali: 'Finali Corporation',
	'lightdeck diagnostics': 'Lightdeck',
	'millennium pharmacy systems': 'Millenium Pharmacy Systems',
	'mineralys therapeutics': 'Mineralys',
	'miragen therapeutics': 'miRagen',
	ngvoice: 'ng-voice',
	'onkure therapeutics': 'OnKure',
	sovrn: 'Sovrn Holdings'
};

const TILE = /(?=<div\b[^>]*\brole="listitem"[^>]*\bclass="companies-list-item\b)/;
const PAGE = /<a\b[^>]*\bhref="(\/companies\/[^"#?]+)"/;
const NAME = /class="companies-hover_link-item"[^>]*>\s*<div\b[^>]*>([\s\S]*?)<\/div>/;
const SECTOR = /class="companies-hover_category"[^>]*>([\s\S]*?)<\/div>/;
const FIELD = /fs-list-field="category"[^>]*>([\s\S]*?)<\/div>/;
const STATUS = /\bdata-status="([^"]*)"/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*<div\b[^>]*>\s*visit website\s*<\/div>/i;
const REALIZED = /^realized$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the company's site, from its page on the fund's site, or nothing when the
// page will not load; a refusal is waited out once
async function siteOf(page: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			return unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const tiles: { name: string; tags: string[]; page: string }[] = [];
	const seen = new Set<string>();
	for (const tile of html.split(TILE).slice(1)) {
		const written = clean(tile.match(NAME)?.[1] ?? '');
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = unescape(tile.match(PAGE)?.[1] ?? '').trim();
		tiles.push({
			name,
			tags: [
				tag(tile.match(FIELD)?.[1] ?? ''),
				tag(tile.match(SECTOR)?.[1] ?? ''),
				REALIZED.test(clean(tile.match(STATUS)?.[1] ?? '')) ? 'Exited' : ''
			],
			page: path ? `${BASE_URL}${path}` : ''
		});
	}
	if (tiles.length === 0) {
		throw new Error('boulder: no companies on the "what we\'ve done" page — the markup moved');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
		if (i > 0) await wait(PACE_MS);
		const batch = tiles.slice(i, i + BATCH_SIZE);
		const sites = await Promise.all(batch.map(({ page }) => (page ? siteOf(page) : '')));
		batch.forEach(({ name, tags, page }, j) => {
			companies.push({
				name,
				category: tags.filter((t, k, all) => t && all.indexOf(t) === k).join(', '),
				url: /^https?:\/\//i.test(sites[j]) ? sites[j] : page || PAGE_URL
			});
		});
	}

	return companies;
}
