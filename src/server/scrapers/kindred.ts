import type { ScrapedCompany } from './types';

const BASE_URL = 'https://kindredventures.com';
const COMPANIES_URL = `${BASE_URL}/wp-json/wp/v2/company`;
const PER_PAGE = 100;
const MAX_PAGES = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on wordpress.com's atomic hosting, which meters requests per
// address and in september 2026 began turning production away with 429s
// after a handful. the portfolio page's search results, two dozen companies
// a request behind a redirect, cost a dozen requests a night; the rest api's
// company type lists every company with the fund's missions and sectors for
// it, and embedding the terms brings their names along, so the whole
// portfolio takes two. it does not carry a company's own address, so a
// company links to its page here.
//
// a refusal is waited out — as long as the host asks, within reason — before
// the night is given up.
const RETRIES = 2;
const RETRY_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60_000;

interface Term {
	taxonomy?: string;
	name?: string;
}

interface Company {
	title?: { rendered?: string };
	link?: string;
	_embedded?: { 'wp:term'?: Term[][] };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const unescape = (s: string) =>
	s
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchPage(page: number): Promise<Response> {
	const url = `${COMPANIES_URL}?per_page=${PER_PAGE}&page=${page}&_embed=wp:term`;
	let resp = await fetch(url, { headers: { 'User-Agent': UA } });
	for (let retry = 0; resp.status === 429 && retry < RETRIES; retry++) {
		// seconds when it is a number; a date, or nothing, gets the default
		const asked = Number(resp.headers.get('retry-after')) * 1000;
		await wait(Math.min(asked > 0 ? asked : RETRY_DELAY_MS, MAX_DELAY_MS));
		resp = await fetch(url, { headers: { 'User-Agent': UA } });
	}
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const listed: Company[] = [];
	let total = 0;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const resp = await fetchPage(page);
		total = Number(resp.headers.get('x-wp-total')) || total;
		const pages = Number(resp.headers.get('x-wp-totalpages')) || 1;
		listed.push(...((await resp.json()) as Company[]));
		if (page >= pages) break;
	}
	if (total > 0 && listed.length < total) {
		throw new Error(`kindred: read ${listed.length} of the ${total} companies listed`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of listed) {
		const name = clean(company.title?.rendered ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const terms = (company._embedded?.['wp:term'] ?? []).flat();
		companies.push({
			name,
			category: [
				...terms.filter((t) => t.taxonomy === 'mission').map((t) => tag(t.name ?? '')),
				...terms.filter((t) => t.taxonomy === 'sector').map((t) => tag(t.name ?? ''))
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: company.link ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('kindred: the rest api lists no companies');
	}

	return companies;
}
