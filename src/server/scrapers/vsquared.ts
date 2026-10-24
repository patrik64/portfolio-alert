import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://vsquared.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js on vercel, since october 2026 (wordpress before, whose api filed
// each company under a "generational growth theme"): the portfolio page is a
// grid of logos, and it describes itself for search engines as a schema.org
// ItemList — an organization each with its name, site and a line about it
// ("Laser-Based Drone Defence"). the list is read; the new site files
// companies under no theme, so they come without tags, and it does not say
// which ones the fund is out of.

const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const STEALTH = /^stealth\b/i;

// companies the site renamed after they were stored, kept under the stored
// names so the renames are not taken for new companies
const STORED_AS: Record<string, string> = {
	arlequin: 'Arlequin AI',
	'black semi': 'Black Semiconductor',
	'group 14': 'Group 14 Technologies',
	micropsi: 'Micropsi Industries',
	'ramblr ai': 'Ramblr',
	'zama ai': 'Zama'
};

interface ItemList {
	'@type'?: string;
	itemListElement?: { item?: { name?: unknown; url?: unknown } }[];
}

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const list = [...html.matchAll(LD)]
		.map(([, json]) => {
			try {
				return JSON.parse(json) as ItemList;
			} catch {
				return undefined;
			}
		})
		.find((ld) => ld?.['@type'] === 'ItemList');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { item } of list?.itemListElement ?? []) {
		const given = clean(item?.name);
		const name = STORED_AS[given.toLowerCase()] ?? given;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = clean(item?.url);
		companies.push({ name, category: '', url: /^https?:\/\//i.test(site) ? site : PAGE_URL });
	}

	if (companies.length === 0) {
		throw new Error('vsquared: no companies in the portfolio page — the markup moved');
	}

	return companies;
}
