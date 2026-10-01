import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://angularventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// drupal: the portfolio page is a list of rows, each linking the company's
// site, or nothing on a few, with its name, a line about it, its
// categories and its cities ("AI, SaaS", "New York, Tel Aviv") as the
// filters read them, kept as tags, the year the fund partnered with it,
// kept as "Invested 2018", and "Acquired" on the ones the fund is out of.

const ROW = /(?=<div class="views-row">)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const FIELD = (name: string) => new RegExp(`<span class="${name}">([\\s\\S]*?)<\\/span>\\s*(?=<span class="\\w+"|<\\/a>)`);
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "AI, SaaS, Industrial" -> ["AI", "SaaS", "Industrial"]
const list = (s: string) =>
	clean(s)
		.split(/\s*,\s*/)
		.filter(Boolean);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const field = (name: string) => row.match(FIELD(name))?.[1] ?? '';
		const name = clean(field('title'));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const acquired = clean(field('acquired'));
		const year = clean(field('partnered')).match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = unescape(row.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...list(field('category')),
				...list(field('geo')),
				year ? `Invested ${year}` : '',
				acquired,
				acquired ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('angular: no companies on the portfolio page');
	}

	return companies;
}
