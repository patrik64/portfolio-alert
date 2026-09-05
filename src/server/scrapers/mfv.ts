import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.mfvpartners.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress under elementor and jetengine. the page shows eight of the fund's
// current companies and two of its past ones, and the rest arrive through
// jetengine's own ajax when Load more is pressed — there is no address that
// serves them, /page/2/ and the filter's own query string both answer with the
// same ten.
//
// so the companies come from the rest api instead, which has all twenty and
// says which sectors and which kind of ending the fund files each under. the
// taxonomies are only ids there, so the two that matter are read as well and
// joined by id, which is also how a term the fund renames follows along.
//
// what the api does not carry is the company's own address: that is a
// jetengine field, and it exists only as the link wrapped around a logo on the
// page. so the ten the page does render keep their own address and the other
// ten keep the fund's page for them, which is the better half of a choice
// between sending every reader to the fund and sending half of them to the
// company.
//
// the year the fund came in is a taxonomy too, and left alone: it is the shape
// of the investment rather than the company.

const CARD = /jet-listing-dynamic-post-(\d+)([\s\S]*?)(?=jet-listing-dynamic-post-\d+|$)/g;
const SITE = /<a class="[^"]*"[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*target="_blank"/;
// the fund's own pages, which are not the company's
const NOT_A_COMPANY = /\/\/(?:[a-z0-9-]+\.)*(?:mfvpartners\.com|linkedin\.com|x\.com|twitter\.com|gmpg\.org)\b/i;
// the taxonomies that say something about the company
const KEPT = ['sector_p', 'portfolio-tag'];

interface Post {
	id?: number;
	link?: string;
	title?: { rendered?: string };
	[taxonomy: string]: unknown;
}
interface Term {
	id?: number;
	name?: string;
}

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [page, listed, ...taxonomies] = await Promise.all([
		fetchText(PAGE_URL),
		fetchText(`${API_URL}/portfolio?per_page=100`).then((body) => JSON.parse(body) as Post[]),
		...KEPT.map((taxonomy) =>
			fetchText(`${API_URL}/${taxonomy}?per_page=100`).then((body) => JSON.parse(body) as Term[])
		)
	]);

	if (listed.length === 0) {
		throw new Error('mfv: the api holds no portfolio companies');
	}

	const words = new Map<number, string>();
	for (const term of taxonomies.flat()) {
		if (term.id && term.name) words.set(term.id, clean(term.name));
	}

	// the company's own address, for the companies the page renders
	const addresses = new Map<string, string>();
	for (const [, id, card] of page.matchAll(CARD)) {
		const site = card.match(SITE)?.[1];
		if (site && !NOT_A_COMPANY.test(site)) addresses.set(id, site);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of listed) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: KEPT.flatMap((taxonomy) => (post[taxonomy] as number[] | undefined) ?? [])
				.map((term) => words.get(term) ?? '')
				.filter(Boolean)
				.join(', '),
			url: addresses.get(String(post.id)) ?? post.link ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('mfv: no companies named in the portfolio');
	}

	return companies;
}
