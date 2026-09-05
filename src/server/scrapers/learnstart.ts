import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.learnstart.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static astro site that renders the portfolio as a table, every row
// carrying its facts as data attributes: the name, the edtech segment the
// fund files it under, occasional extra tags, and the deal's fund,
// instrument and year. a focus cell words the segment more finely. the rows
// link nowhere — the site knows no company addresses — and the fund and
// instrument are deal mechanics rather than anything about the company, so
// segment, focus, tags and the year the fund came in make the category.

const ROW = /<tr class="pf-row"([^>]*)>([\s\S]*?)<\/tr>/g;
const FOCUS = /class="c-focus"[^>]*>([\s\S]*?)<\/td>/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const attr = (row: string, name: string) =>
	new RegExp(`${name}="([^"]*)"`).exec(row)?.[1] ?? '';

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ROW)) {
		const [, attrs, cells] = m;
		const name = clean(attr(attrs, 'data-company'));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const focus = clean(cells.match(FOCUS)?.[1] ?? '');
		companies.push({
			name,
			category: [
				tag(attr(attrs, 'data-category')),
				focus === '—' ? '' : tag(focus),
				...clean(attr(attrs, 'data-tags')).split(',').map(tag),
				clean(attr(attrs, 'data-year'))
			]
				.filter(Boolean)
				.join(', '),
			url: ''
		});
	}

	if (companies.length === 0) {
		throw new Error('learnstart: no companies in the portfolio table');
	}

	return companies;
}
