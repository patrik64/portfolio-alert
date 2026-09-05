import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://notation.vc/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the whole list is served in the page, a row a company, with what the fund
// files it under written into the row's own classes as type-finance and the
// like. what those stand for is written out beside the list, where the fund
// offers them as filters — Better Money for finance, Learning for education —
// so the filters are read first and the classes put through them, rather than
// a slug being tidied up into a word the fund does not use.
//
// a row also carries is-inactive, and the fund draws those companies in grey
// where it draws the rest in black. it says nowhere what it means by it and
// puts no word on the page, so its own word is the one kept: a greyed company
// is recorded as Inactive rather than as an exit it may not have been.
//
// most rows link to the company. one does not — the fund publishes no address
// for Irene and writes its row without a link — so that one keeps none.

const ROW = /<div id="([^"]*)" class="([^"]*\bcompany-row\b[^"]*)"([\s\S]*?)(?=<div id="[^"]*" class="[^"]*\bcompany-row\b|<\/div>\s*<\/div>\s*<\/div>\s*<\/section>|$)/g;
const FILTER = /data-filter="([^"]+)"[^>]*>([^<]*)<\/a>/g;
const NAME = /<span class="company-name">([\s\S]*?)<\/span>/;
const LINK = /<a[^>]*\bhref="([^"]+)"[^>]*class="toggle-link/;
const TYPE = /\btype-[a-z0-9-]+/g;
// the class the fund greys a company out with
const GREYED = /\bis-inactive\b/;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a filter written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// what the fund calls each of the classes it files a company under
	const named = new Map<string, string>();
	for (const [, slug, label] of html.matchAll(FILTER)) {
		const written = tag(label);
		if (slug !== 'all' && written) named.set(slug, written);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, , classes, row] of html.matchAll(ROW)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				...(classes.match(TYPE) ?? []).map((type) => named.get(type) ?? ''),
				GREYED.test(classes) ? 'Inactive' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: clean(row.match(LINK)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('notation: no companies in the list');
	}

	return companies;
}
