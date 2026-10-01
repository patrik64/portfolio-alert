import type { ScrapedCompany } from './types';

const PAGE_URL = 'http://www.aperturevp.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-built page: the portfolio is two runs of logos, "Active
// Investments" and "Exited/Public Investments", each named in its alt text
// and linking the company's site, a few with an address missing its
// scheme ("www.otonomy.com"), which is read as one, or with none at all.
// a company under the second heading is one the fund is out of.

// the runs sit in the page's content block, below the header's own logo
const CONTENT = /\bid="page_content"/;
const HEADING = /<h2\b[^>]*>([\s\S]*?)<\/h2>/g;
const LOGO = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*<img\b[^>]*\balt="([^"]*)"/g;
const EXITED = /\bexited\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "www.otonomy.com" -> "https://www.otonomy.com"
const site = (href: string) => {
	const link = unescape(href).trim();
	if (/^https?:\/\//i.test(link)) return link;
	return /^www\.[\w-]+\./i.test(link) ? `https://${link}` : '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const page = await resp.text();
	const at = page.search(CONTENT);
	if (at < 0) {
		throw new Error('aperture: no content block on the portfolio page');
	}
	const html = page.slice(at);
	const headings = [...html.matchAll(HEADING)].map((m) => ({ at: m.index ?? 0, text: clean(m[1]) }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const logo of html.matchAll(LOGO)) {
		const name = clean(logo[2]);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const heading = headings.filter(({ at }) => at < (logo.index ?? 0)).at(-1)?.text ?? '';
		companies.push({
			name,
			category: EXITED.test(heading) ? 'Exited' : '',
			url: site(logo[1]) || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('aperture: no logos on the portfolio page');
	}

	return companies;
}
