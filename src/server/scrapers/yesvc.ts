import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://yes.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#8217;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the page is server-rendered wordpress: one section per category — an <h2>
// heading followed by the companies as cards, each carrying the company site
// as its only link and the name in an <h3>. acquisition notes appended to some
// names ("Superhuman (acquired by Grammarly)") are stripped, so an exit
// doesn't rename the company into a phantom newcomer.

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	for (const section of html.split('<h2 class="animate">').slice(1)) {
		const category = decode(section.slice(0, section.indexOf('</h2>')));
		for (const m of section.matchAll(
			/<a href="([^"]*)" class="portfolio-arrow"[\s\S]*?<h3>([^<]+)<\/h3>/g
		)) {
			const name = decode(m[2]).replace(/\s*\(acquired by [^)]*\)$/i, '');
			if (name) companies.push({ name, category, url: m[1] });
		}
	}
	return companies;
}
