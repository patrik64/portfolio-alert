import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://pebblebed.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, rendered on the server: the portfolio page describes its
// companies to search engines as a list in schema.org's terms, served with
// the page, each an organization with its name, its site, a description
// and the year it was founded, which is kept as a tag. the table the page
// draws is restyled from time to time; the list has kept to the standard.
// nothing marks an exit.

const LD_JSON = /<script\b[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
const STEALTH = /^stealth\b/i;

interface Organization {
	name?: string;
	url?: string;
	foundingDate?: string;
}

interface CollectionPage {
	'@type'?: string;
	mainEntity?: { itemListElement?: { item?: Organization }[] };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const organizations: Organization[] = [];
	for (const [, json] of html.matchAll(LD_JSON)) {
		let data: CollectionPage;
		try {
			data = JSON.parse(json) as CollectionPage;
		} catch {
			continue;
		}
		if (data['@type'] !== 'CollectionPage') continue;
		for (const { item } of data.mainEntity?.itemListElement ?? []) {
			if (item) organizations.push(item);
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { name: written, url, foundingDate } of organizations) {
		const name = (written ?? '').replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const founded = String(foundingDate ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = (url ?? '').trim();
		companies.push({
			name,
			category: founded ? `Founded ${founded}` : '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('pebblebed: no companies in the page\'s schema.org list');
	}

	return companies;
}
