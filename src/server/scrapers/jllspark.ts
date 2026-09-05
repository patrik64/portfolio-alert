import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://spark.jllt.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the whole grid on the one page: every box wraps its logo in a
// link to the company's own address whose title attribute names it — the
// #new_tab fragment is the site's own signal and comes off. the line under
// the logo is a description, and no sectors are recorded.

const BOX = /<a href="(https?:\/\/[^"#]+)(?:#[^"]*)?" title="([^"]+)">/g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, site, title] of html.matchAll(BOX)) {
		const name = clean(title);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: site });
	}

	if (companies.length === 0) {
		throw new Error('jllspark: no companies on the portfolio page');
	}

	return companies;
}
