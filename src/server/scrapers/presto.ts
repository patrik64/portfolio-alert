import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.prestoventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a table, the whole of it in the page, a row a
// company giving its name, where it comes from ("Czechia", "Georgia"), a
// year, whether it is "Current" or "Exited", a line about it, its
// industries ("Enterprise Software", "MarTech & AdTech") and a link to its
// site. the industries and the origin are kept as tags, an exit with the
// Exited tag; the year is left unread, as the table does not say what it
// is.

const ROW = /(?=<div\b[^>]*role="listitem" class="portfolio-item w-dyn-item">)/;
const NAME = /fs-cmsfilter-field="Company"[^>]*>([\s\S]*?)<\/h3>/;
const ORIGIN = /fs-cmsfilter-field="Country"[^>]*>([\s\S]*?)<\/div>/;
const STATUS = /fs-cmsfilter-field="status"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a href="([^"]*)" target="_blank" class="w-inline-block"><img\b[^>]*alt="link-icon"/;
const INDUSTRY = /fs-cmsfilter-field="Industries"[^>]*>([^<]+)</g;
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const industries = [...row.matchAll(INDUSTRY)].map(([, industry]) => tag(industry));
		const site = unescape(row.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...industries,
				tag(row.match(ORIGIN)?.[1] ?? ''),
				EXITED.test(clean(row.match(STATUS)?.[1] ?? '')) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('presto: no companies in the portfolio table — the markup moved');
	}

	return companies;
}
