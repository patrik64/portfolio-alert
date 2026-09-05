import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.venturesplatform.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// every company ships in the static html: the finsweet cmsfilter chips filter in
// the browser and there is no pagination wrapper. each card carries a hidden
// dropdown holding the company website plus the Industry / Initial Investment /
// Status fields; the "Operating in" countries are cmsnest targets that only fill
// in client-side, so they stay out. the exited ribbon is bound to a separate
// flag and stays w-condition-invisible even for some exits, so the Status field
// is what marks an exit. names come from the logo alt, which tracks the detail
// page slug on every card.

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split('class="portfolio-collection-item w-dyn-item"').slice(1)) {
		const card = item.split('class="portfolio-collection-item w-dyn-item"')[0];
		const name = (card.match(/alt="([^"]*)" class="company-logo"/)?.[1] ?? '')
			.replace(/\s+/g, ' ')
			.trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const tags = [
			...[...card.matchAll(/fs-cmsfilter-field="sector" class="text-size-medium">([^<]*)</g)].map(
				(m) => m[1].trim()
			),
			card.match(/fs-cmsfilter-field="stage" class="text-size-medium">([^<]*)</)?.[1]?.trim() ?? ''
		].filter(Boolean);
		// Active / Inactive / Exited — only the two that say something get a tag
		const status =
			card.match(/fs-cmsfilter-field="status" class="text-size-medium">([^<]*)</)?.[1]?.trim() ?? '';
		if (status && status !== 'Active') tags.push(status);

		// the website link is href="#" (w-dyn-bind-empty) when none is on file,
		// and the fund's own company page stands in
		const slug = card.match(/href="\/portfolio-companies\/([^"]+)"/)?.[1] ?? '';
		const site = card.match(
			/<a href="(https?:\/\/[^"]+)" class="w-inline-block"><div class="text-weight-normal">/
		)?.[1];

		companies.push({
			name,
			category: tags.join(', '),
			url: site ?? (slug ? `${BASE_URL}/portfolio-companies/${slug}` : '')
		});
	}

	if (companies.length === 0) {
		throw new Error('venturesplatform: no companies on the portfolio page');
	}

	return companies;
}
