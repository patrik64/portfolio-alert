import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.innovationendeavors.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js rendering the portfolio as a plain list: every entry links the
// company's name to its own address (an acquired one to its acquirer's
// page), notes "(Acquired)" where the fund is out, and follows with a
// description after a dash. no sectors anywhere.

const ITEM = /<li>\s*<a href="(https?:\/\/[^"]+)">([^<]+)<\/a>((?:[^—<]|<!-- -->)*)/g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#x27;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, site, label, trailer] of html.matchAll(ITEM)) {
		const name = clean(label);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: /\(acquired\)/i.test(clean(trailer)) ? 'Exited' : '',
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('innovationendeavors: no companies on the page');
	}

	return companies;
}
