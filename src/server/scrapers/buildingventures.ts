import type { ScrapedCompany } from './types';

const BASE_URL = 'https://buildingventures.com';
const PAGE_URL = `${BASE_URL}/companies/`;
// the pages kept under the companies page, which is page 2271: one for each
// company the fund has written up
const API_URL = `${BASE_URL}/wp-json/wp/v2/pages?parent=2271&per_page=100&_fields=slug,title,content`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on salient: the companies page is a grid of tiles, each a logo
// with the company's name over it and the classes the filters read — the
// phase of a building's life it works in ("Design", "Build", "Operate",
// "Experience"), whether the fund is still in it ("Active", "Exit") and
// which fund holds it ("Fund I", "Fund II"; the oldest exits, from before
// the funds, name neither). two companies are both "Join" on their tiles.
//
// a tile links the company's page on the fund's site or, on the oldest
// exits, straight out to whoever has the product now. the company pages
// are children of the companies page and the rest api lists them whole:
// the title, which is the company's name in full ("Join.build", "Join
// Digital"), the site as the first link out, and its milestones — the
// rounds the fund took part in, the first of them the one it came in at,
// and an "Acquired 2026" on the ones sold, with no word of the buyer. so
// the grid is read for who is in the portfolio and the api for the rest;
// the names hang on it, so it has to answer.

const TILE = /(?=<div class="col span_3\b[^"]*\belement\b)/;
const FILED = /\bdata-filter="([^"]*)"/;
const PAGE = /<div class="work-info">\s*<a\b[^>]*\bhref="([^"]*)"/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
// a choice of a filter: the class the tiles carry, and how it is spelled out
const CHOICE = /<button\b[^>]*\bdata-filter="\.([^"]+)"[^>]*>([\s\S]*?)<\/button>/g;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const OWN = /(?:^|\.)buildingventures\.com$/i;
const SOCIAL = /(?:^|\.)(?:linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|vimeo\.com|medium\.com)$/i;
// the milestones, a line apiece, as the page builder's text block holds them
const MILESTONES = /MILESTONES([\s\S]*?)\[\/vc_column_text\]/i;
const STEALTH = /^stealth\b/i;

interface Page {
	slug?: string;
	title?: { rendered?: string };
	content?: { rendered?: string };
}

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

const hostOf = (link: string) => {
	try {
		return new URL(link, PAGE_URL).hostname;
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const tiles = html.split(TILE).slice(1);
	if (tiles.length === 0) {
		throw new Error('buildingventures: no companies on the companies page');
	}
	const labels = new Map([...html.matchAll(CHOICE)].map(([, slug, label]) => [slug, tag(label)]));

	const pages = new Map<string, Page>();
	for (let page = 1, last = 1; page <= last && page <= 20; page++) {
		const url = `${API_URL}&page=${page}`;
		const listed = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (!listed.ok) {
			throw new Error(`Failed to fetch ${url}: ${listed.status}`);
		}
		for (const written of (await listed.json()) as Page[]) {
			if (written.slug) pages.set(written.slug, written);
		}
		last = Number(listed.headers.get('x-wp-totalpages') ?? '1') || 1;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const tile of tiles) {
		const link = unescape(tile.match(PAGE)?.[1] ?? '').trim();
		const out = link && !OWN.test(hostOf(link)) ? link : '';
		// the company's page, by the last part of its address on the fund's site
		const written = out
			? undefined
			: pages.get(
					new URL(link || PAGE_URL, PAGE_URL).pathname
						.replace(/\/+$/, '')
						.split('/')
						.pop() ?? ''
				);
		const name = clean(written?.title?.rendered ?? '') || clean(tile.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const content = written?.content?.rendered ?? '';
		const site = [...content.matchAll(LINK)]
			.map((m) => unescape(m[1]))
			.find((url) => !OWN.test(hostOf(url)) && !SOCIAL.test(hostOf(url)));
		// "Series A in 2019", "Series Seed 2023", "Acquired 2026"
		const milestones = (content.match(MILESTONES)?.[1] ?? '')
			.split(/<br\s*\/?>/i)
			.map(clean)
			.filter(Boolean);
		const [, round, year] = milestones[0]?.match(/^(.*?)(?:\s+in)?\s*((?:19|20)\d{2})?$/) ?? [];

		const filed = (tile.match(FILED)?.[1] ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.map((slug) => labels.get(slug) ?? slug.replace(/-/g, ' '));
		const exited = filed.some((label) => /^exit(ed)?$/i.test(label));
		companies.push({
			name,
			category: [
				...filed.filter((label) => !/^(active|exit(ed)?)$/i.test(label)),
				/^acquired\b/i.test(round ?? '') ? '' : tag(round ?? ''),
				year && !/^acquired\b/i.test(round ?? '') ? `Invested ${year}` : '',
				milestones.some((line) => /^acquired\b/i.test(line)) ? 'Acquired' : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || out || (link ? new URL(link, PAGE_URL).href : PAGE_URL)
		});
	}

	return companies;
}
