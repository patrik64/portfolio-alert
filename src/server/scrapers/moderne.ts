import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.moderneventures.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;
const MAX_PAGES = 20;

// webflow, paged thirty at a time behind a Next link the browser follows as
// you scroll, so the pages are walked here instead.
//
// the page lists two kinds of company and says plainly what each is: its
// investments, and ninety companies that "have graduated from Moderne
// Passport, a six-month industry immersion program providing exclusive access
// to potential customers". a cohort is not a portfolio, and announcing one as
// a night's newcomers would say the fund had backed them when it has not said
// so, so only the thirty-six it marks as investments are kept.
//
// what a company does is not on the card. the fund fills those in from a stub
// page per company — six kilobytes holding nothing but the two lists — which
// is finsweet's cms nest, and the same request every visitor's browser makes.
// so the thirty-six stubs are fetched for them.
//
// several of the fund's own terms have commas inside them: Fintech,
// Insuretech and Digital Fraud, Security are one label each. the category is
// comma-joined, so those commas are written as slashes to keep a label whole.

const ITEM = /<div[^>]*role="listitem" class="portfolio-item w-dyn-item">([\s\S]*?)(?=<div[^>]*role="listitem" class="portfolio-item w-dyn-item">|<div role="navigation")/g;
const NAME = /class="text-block-27">([\s\S]*?)<\/div>/;
const SITE = /<a href="([^"]*)"[^>]*class="portfolio-card-link"/;
const PAGE = /<a href="(\/portfolio\/[^"]+)" class="portfolio-link"/;
const KIND = /fs-cmsfilter-field="type"[^>]*>([\s\S]*?)<\/div>/;
const SOLD = /class="portfolio-tag([^"]*)"[^>]*><div>([\s\S]*?)<\/div>/;
const NEXT = /<a href="(\?[^"]*_page=\d+)"[^>]*class="w-pagination-next"/;
// a company the fund says it has invested in, rather than one it ran a
// programme for
const INVESTED = /^investment$/i;
// webflow leaves a field in place and hides it when it has nothing to say
const HIDDEN = /w-condition-invisible/;
// the stub lists a term as a link to it and the fund's word for it beside
const TERM = /<a href="\/[a-z-]+\/[^"]*">[^<]*<\/a><div>([^<]*)<\/div>/g;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// one label, however many commas the fund put in it
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const listed: { name: string; url: string; page: string; state: string }[] = [];
	const seen = new Set<string>();

	let next: string | undefined = PAGE_URL;
	for (let page = 1; next && page <= MAX_PAGES; page++) {
		const html: string = await fetchText(next);

		for (const [, card] of html.matchAll(ITEM)) {
			if (!INVESTED.test(clean(card.match(KIND)?.[1] ?? ''))) continue;

			const name = clean(card.match(NAME)?.[1] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			const sold = card.match(SOLD);
			listed.push({
				name,
				url: card.match(SITE)?.[1] ?? '',
				page: card.match(PAGE)?.[1] ?? '',
				state: sold && !HIDDEN.test(sold[1]) ? clean(sold[2]) : ''
			});
		}

		const following = html.match(NEXT)?.[1];
		next = following ? `${PAGE_URL}${following}` : undefined;
	}

	if (listed.length === 0) {
		throw new Error('moderne: no invested companies in the portfolio');
	}

	const companies: ScrapedCompany[] = [];
	for (let at = 0; at < listed.length; at += BATCH_SIZE) {
		const batch = listed.slice(at, at + BATCH_SIZE);
		const stubs = await Promise.all(
			batch.map((company) =>
				company.page ? fetchText(`${BASE_URL}${company.page}`) : Promise.resolve('')
			)
		);
		batch.forEach((company, index) => {
			const terms = [...stubs[index].matchAll(TERM)].map((term) => tag(term[1])).filter(Boolean);
			companies.push({
				name: company.name,
				category: [...new Set([...terms, company.state])].filter(Boolean).join(', '),
				url: company.url
			});
		});
	}

	return companies;
}
