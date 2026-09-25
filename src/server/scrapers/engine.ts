import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://engineventures.com/companies';
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a site of its own, rendered on the server: the companies page lists every
// company as a row linking its page on the fund's site, with the name, a
// line about it, the industries it is filed under as slugs on the row
// ("advanced-materials") — the page's industry filter spells them out — and,
// on one the fund is out of, "Exited". the company's page names its site in
// a definition list, so those pages are fetched for that; one that will not
// load leaves its company linking to that page.

const ITEM = /(?=<li[^>]*class="companies-list__item)/;
const EXITED = /^<li[^>]*companies-list__item--exited/;
const INDUSTRIES = /^<li[^>]*\bdata-industries="([^"]*)"/;
const PAGE = /<a\b[^>]*\bhref="(https?:\/\/engineventures\.com\/companies\/[^"#?]+)"/;
const NAME = /class="companies-list__link-title"[^>]*>([\s\S]*?)<\/h3>/;
const OPTION = /<input\b[^>]*\bname="industry"[^>]*\bvalue="([^"]+)"[^>]*\bdata-label="([^"]*)"/g;
const WEBSITE = /<dt>\s*Website\s*<\/dt>\s*<dd>\s*<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
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

// the site a company's page names, or nothing when the page will not load
async function siteOf(page: string): Promise<string> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return '';
		return unescape((await resp.text()).match(WEBSITE)?.[1] ?? '');
	} catch {
		return '';
	}
}

interface Row {
	name: string;
	page: string;
	industries: string[];
	exited: boolean;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the filter's options spell the industry slugs out
	const labels = new Map([...html.matchAll(OPTION)].map(([, slug, label]) => [slug, tag(label)]));

	const rows: Row[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ITEM).slice(1)) {
		const item = chunk.split('</li>')[0];
		const name = clean(item.match(NAME)?.[1] ?? '');
		const page = unescape(item.match(PAGE)?.[1] ?? '');
		if (!name || !page || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		rows.push({
			name,
			page,
			industries: (item.match(INDUSTRIES)?.[1] ?? '')
				.split(',')
				.map((slug) => slug.trim())
				.filter(Boolean)
				.map((slug) => labels.get(slug) ?? slug),
			exited: EXITED.test(item)
		});
	}
	if (rows.length === 0) {
		throw new Error('engine: no companies on the companies page');
	}

	const companies: ScrapedCompany[] = [];
	for (const [i, row] of rows.entries()) {
		if (i > 0) await wait(PACE_MS);
		const site = await siteOf(row.page);
		companies.push({
			name: row.name,
			category: [...row.industries, row.exited ? 'Exited' : '']
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: site || row.page
		});
	}

	return companies;
}
