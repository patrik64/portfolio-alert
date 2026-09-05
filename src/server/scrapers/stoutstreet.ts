import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.stoutstreetcapital.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// hand-written html, one page. the portfolio is grouped by the fund that holds
// it — fund i, ii, iii and a frontier fund still writing its first cheques —
// with a final group for the companies that have exited. only that last group
// says anything about a company; the rest is which pot of money bought it.
//
// the fund is candid that this is "a selection, not the complete book", so
// what is tracked here is what it chooses to publish.

const GROUP = '<div class="pf-group">';
const GROUP_NAME = /<span class="gt">([^<]*)<\/span>/;
const LINK = /<a class="pf-link" href="([^"]*)"[^>]*>\s*<span class="co">([^<]*)<\/span>/g;
const EXITED = /^exited$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const group of html.split(GROUP).slice(1)) {
		const exited = EXITED.test(clean(group.match(GROUP_NAME)?.[1] ?? ''));
		for (const m of group.matchAll(LINK)) {
			const name = clean(m[2]);
			if (!name || seen.has(name)) continue;
			seen.add(name);
			companies.push({ name, category: exited ? 'Exited' : '', url: m[1] });
		}
	}

	if (companies.length === 0) {
		throw new Error('stoutstreet: no companies on the portfolio page');
	}

	return companies;
}
