import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.xfactor.ventures';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 20;

// squarespace assets and the fund's own pages, plus socials — everything on a
// detail page that is not the company's site
const NOT_THE_COMPANY =
	/squarespace|sqspcdn|xfactor\.ventures|linkedin\.|twitter\.|x\.com|instagram\.|facebook\.|youtube\.|medium\.|crunchbase\./;

// links on the portfolio page that are navigation, not companies
const NAV = new Set(['/', '/home', '/work-with-us-1', '/newsletter', '/portfolio', '/team', '/contact', '/about', '/cart']);

const decode = (s: string) =>
	s
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

// the portfolio page is squarespace text blocks: <h3> runs with one anchor
// per company, each pointing at the company's own page on the fund's site.
// that detail page carries the company site as its only external link — some
// companies have none. no categories anywhere.

async function fetchSite(path: string): Promise<string> {
	try {
		const resp = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return '';
		const body = (await resp.text()).split('<body')[1] ?? '';
		for (const m of body.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"/g)) {
			// URL normalizes the site's occasional all-caps hostnames
			if (!NOT_THE_COMPANY.test(m[1])) return new URL(m[1]).href;
		}
		return '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const entries: { name: string; path: string; url: string }[] = [];
	const seen = new Set<string>();
	for (const [, block] of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)) {
		for (const [, href, label] of block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
			const name = decode(label);
			if (!name || name.includes('↗') || seen.has(href)) continue;
			seen.add(href);
			// an external href is the company site itself; anything else is a
			// detail page on the fund's site (one link lacks its leading slash)
			if (href.startsWith('http') && !href.startsWith(BASE_URL)) {
				entries.push({ name, path: '', url: href });
				continue;
			}
			const path = href.replace(BASE_URL, '').replace(/^(?!\/)/, '/');
			if (NAV.has(path)) continue;
			entries.push({ name, path, url: '' });
		}
	}
	if (entries.length === 0) {
		throw new Error('xfactorventures: no companies on the portfolio page');
	}

	// fetch each company's site from its detail page (in batches)
	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		const batch = entries.slice(i, i + BATCH_SIZE);
		const sites = await Promise.all(batch.map((e) => (e.path ? fetchSite(e.path) : e.url)));
		for (let j = 0; j < batch.length; j++) {
			companies.push({ name: batch[j].name, category: '', url: sites[j] });
		}
	}

	return companies;
}
