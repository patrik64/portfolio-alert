import type { ScrapedCompany } from './types';

const BASE_URL = 'https://parkwalk.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with facetwp, fifteen companies to the page and fourteen pages of
// them. facetwp takes its page from _paged, so the pages can be walked without
// going through its ajax.
//
// each card opens a panel giving the company's name, what it does, the sector
// the fund files it under, the university it came out of and, for most of
// them, its site. the fund invests in university spinouts, so the institution
// is as much a part of how it files a company as the sector, and both are
// kept.
//
// one sector is written "Digital Health, MedTech" — a single heading with a
// comma in it rather than two, which is why it is folded rather than split.

const PANEL = /<h2 class="portfolio-modal__title">\s*([^<]*?)\s*<\/h2>([\s\S]*?)<\/dl>/g;
const FIELD = /<dt>([^<]*)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;
const SITE = /href="(https?:\/\/(?!(?:www\.)?parkwalk\.vc)[^"]+)"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so the fund's "Digital Health, MedTech" would
// read as two sectors rather than the one it is
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	for (let page = 1; page <= 40; page++) {
		const url = `${PAGE_URL}?_paged=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		let added = 0;
		for (const m of html.matchAll(PANEL)) {
			const name = clean(m[1]);
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			added++;

			const fields = new Map([...m[2].matchAll(FIELD)].map((f) => [clean(f[1]), f[2]]));
			companies.push({
				name,
				category: [tag(fields.get('Sector') ?? ''), tag(fields.get('Institution') ?? '')]
					.filter(Boolean)
					.join(', '),
				url: fields.get('Website')?.match(SITE)?.[1] ?? ''
			});
		}

		if (added === 0) break;
	}

	if (companies.length === 0) {
		throw new Error('parkwalk: no companies on the portfolio page');
	}

	return companies;
}
