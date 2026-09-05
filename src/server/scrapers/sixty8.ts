import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.sixty8.capital/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace gallery, each tile linking straight to the company with its name
// as the logo's alt text. there are no captions and the fund marks no sectors
// or exits, so the name and the address are all there is.
//
// two logos were uploaded without alt text, and squarespace fills that in with
// the filename — "company_thumbs_ZCL.png" — which names nobody, so those two
// are named by their own domain instead.

const ITEM = '<figure class="gallery-grid-item';
const NAME = /alt="([^"]*)"/;
const SITE = /href="(https?:\/\/[^"]+)"/;
const FILENAME = /\.(?:png|jpe?g|gif|webp|svg)$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const site = item.match(SITE)?.[1] ?? '';
		let name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || FILENAME.test(name)) {
			try {
				name = capitalize(new URL(site).hostname.replace(/^www\./, '').split('.')[0]);
			} catch {
				name = '';
			}
		}
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: site });
	}

	if (companies.length === 0) {
		throw new Error('sixty8: no companies on the portfolio page');
	}

	return companies;
}
