import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://juvovc.org/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress over elementor, the portfolio written as prose: each company is
// a paragraph opening with its name in bold and closing on a "Learn more"
// link to its own address. no sectors per company — the fund's three focus
// areas belong to the fund, not to anyone in particular.

const ENTRY = /<p>\s*<strong>([^<]+)<\/strong>([\s\S]*?)<\/p>/g;
const SITE = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>\s*Learn more/;

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
	for (const [, bold, rest] of html.matchAll(ENTRY)) {
		const name = clean(bold);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: rest.match(SITE)?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('juvo: no companies on the portfolio page');
	}

	return companies;
}
