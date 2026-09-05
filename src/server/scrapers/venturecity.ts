import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.theventure.city/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow. the page carries a pagination control, but following it only
// deals the same companies again in another order — every one of them is on
// the first page already, several of them twice — so one request is the whole
// portfolio, deduplicated by name.
//
// a card names the company, the country it works from and its industry, and
// links both the fund's page for it and the company's own site.

const ITEM = 'class="our-companies-cms-item w-dyn-item"';
const NAME = /fs-cmsfilter-field="\?"[^>]*>([^<]*)</;
const REGION = /fs-cmsfilter-field="Region"[^>]*>([^<]*)</;
const INDUSTRY = /fs-cmsfilter-field="industry"[^>]*>([^<]*)</;
const SITE = /href="(https?:\/\/[^"]+)"/;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = (item.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const site = item.match(SITE)?.[1] ?? '';
		companies.push({
			name,
			category: [(item.match(INDUSTRY)?.[1] ?? '').trim(), (item.match(REGION)?.[1] ?? '').trim()]
				.filter(Boolean)
				.join(', '),
			url: site.includes('theventure.city') ? '' : site
		});
	}

	if (companies.length === 0) {
		throw new Error('venturecity: no companies on the page');
	}

	return companies;
}
