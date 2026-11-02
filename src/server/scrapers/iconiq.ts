import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.iconiq.com/growth/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 10;

// webflow: a collection a hundred to a page, walked through its own "next" links,
// which the page's script follows to show them all. a card has the name, a line about
// the company, its site, and for the page's filters its categories, among them
// "IPO/Acquired" on the ones it is. a smaller list of featured companies above repeats
// some of these in another markup, and is passed over.
const CARD = /(?=class="companies-list_grid-item is-new w-dyn-item")/;
const NAME = /fs-list-field="name"[^>]*>([^<]*)/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="button-new\b/;
const CATEGORY = /fs-list-field="category"[^>]*>([^<]*)/g;
const LOGO = 'companies-list_logo-wrapper';
const NEXT = /<a\b[^>]*\bhref="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;
const OUT = /^ipo\/acquired$/i;

const clean = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#0?39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let url: string | undefined = PAGE_URL;
	for (let page = 0; url && page < MAX_PAGES; page++) {
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		for (const card of html.split(CARD).slice(1)) {
			const name = clean(card.match(NAME)?.[1] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			// the last card of a page runs on to the end of it, its own fields before the logo
			const categories = [...card.split(LOGO)[0].matchAll(CATEGORY)].map(([, label]) => tag(label));
			companies.push({
				name,
				category: [...categories, categories.some((label) => OUT.test(label)) ? 'Exited' : '']
					.filter(Boolean)
					.join(', '),
				url: card.match(SITE)?.[1] ?? ''
			});
		}
		const next: string | undefined = html.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${next}` : undefined;
	}

	if (companies.length === 0) {
		throw new Error('iconiq: no companies on the portfolio page');
	}

	return companies;
}
