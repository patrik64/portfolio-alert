import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.f2vc.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the companies page (Webflow) shows one company set twice: a table whose rows
// carry the categories, and a modal per company with the name and website.
// both sides share the modal id (the row opens its modal via data-src), which
// joins them. cards named "Stealth" are unannounced placeholders — no name, no
// site — and are skipped

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const categoryById = new Map<string, string>();
	for (const row of html.split('class="table_row w-dyn-item"').slice(1)) {
		const id = row.match(/data-src="([^"]+)"/)?.[1];
		const category = row.match(/data_item_category_name="([^"]*)"/)?.[1];
		if (id && category) categoryById.set(id, decode(category));
	}

	const modals = [...html.matchAll(/<div id="([^"]+)" modal_wrapper="modal_wrapper"/g)];
	const companies: ScrapedCompany[] = [];
	for (const [i, modal] of modals.entries()) {
		const block = html.slice(modal.index, modals[i + 1]?.index ?? html.length);
		const name = decode(block.match(/<h2 class="hero_blue_card is-inline">([^<]*)</)?.[1] ?? '');
		if (!name || name.toLowerCase() === 'stealth') continue;
		const site =
			block.match(
				/<a[^>]*href="([^"]+)"[^>]*>\s*<div class="margin-bottom tiny"><div class="company_modal_small_t bold">Website<\/div>/
			)?.[1] ?? '';
		companies.push({
			name,
			category: categoryById.get(modal[1]) ?? '',
			url: site === '#' ? '' : site
		});
	}

	if (companies.length === 0) {
		throw new Error('f2: no companies found on the companies page');
	}

	return companies;
}
