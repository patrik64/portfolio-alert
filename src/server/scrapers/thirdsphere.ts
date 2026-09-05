import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://thirdsphere.com/portfolio/all/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with its rest api switched off, but the "all" view of the
// portfolio holds every company in the html: each is a tile linking straight
// out, named twice over — in the caption the tile keeps hidden until hover,
// and in the link's title.
//
// the caption is the one to trust: ten of the links were given the company's
// address as their title instead of its name, and the caption names those
// properly (Return To Vendor, not rtv.earth).
//
// the fund files companies under categories, but the tiles carry none of that
// — the categories are separate views of the same list — so the category is
// left empty rather than fetched a second time per company.

const ITEM = 'portfolio-item-listing"';
const LINK = /<a href="(https?:\/\/[^"]+)"[^>]*title="([^"]*)"/;
const CAPTION = /class="px-1">\s*([^<]*?)\s*<\/div>/;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const link = item.match(LINK);
		const caption = (item.match(CAPTION)?.[1] ?? '').trim();
		const titled = (link?.[2] ?? '').trim();
		const name = caption || (/^https?:\/\//.test(titled) ? '' : titled);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: link?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('thirdsphere: no companies on the portfolio page');
	}

	return companies;
}
