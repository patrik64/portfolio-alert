import type { ScrapedCompany } from './types';

const BASE_URL = 'https://ovr.vc';
const REST_URL = `${BASE_URL}/wp-json/wp/v2`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// in october 2026 mcj became override: mcj.vc now answers with a permanent
// redirect to ovr.vc, a wordpress site whose portfolio is a post type the
// rest api serves, a company a record. the fund files each under its sector,
// what it sells (hardware, software, services) and the rounds it came in at,
// as terms of three taxonomies, read once for their names; a fourth says which
// of its funds, which is the fund's business rather than the company's.
//
// the company's own address is not in the record. it is the one button on the
// company's page, so the pages are read one after another. the host answers
// a quick run of requests with 429s that pass in seconds, and say nothing of
// how long, so every request waits a while and asks again; a company page that
// will not come leaves the company with the page itself as its link.
//
// the new site lists the 39 companies of the fund's second fund, under names
// that are in five places not the ones mcj used. the old site's 89 stay stored.

const TAXONOMIES = ['sector', 'business-model', 'stage-invested'] as const;
const TRIES = 4;
const BACKOFF_MS = 2_000;
const PACE_MS = 250;
const BUTTON = /<a class="elementor-button elementor-button-link[^"]*" href="(https?:\/\/[^"]+)"/;

// companies stored from mcj's site under the names it gave them
const STORED_AS: Record<string, string> = {
	aalo: 'Aalo Atomics',
	hammerhead: 'Hammerhead AI',
	'mantel capture': 'Mantel',
	'odyssey energy solutions': 'Odyssey Energy',
	// the new site misspells it
	resevoir: 'Reservoir'
};

type Taxonomy = (typeof TAXONOMIES)[number];

type Item = { title?: { rendered?: string }; link?: string } & { [T in Taxonomy]?: number[] };

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#8211;/g, '–')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a term holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url: string): Promise<Response> {
	for (let attempt = 1; ; attempt++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.status !== 429 || attempt === TRIES) return resp;
		await wait(BACKOFF_MS * attempt);
	}
}

async function json<T>(url: string): Promise<T> {
	const resp = await get(url);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return (await resp.json()) as T;
}

async function siteOf(page: string): Promise<string> {
	try {
		const resp = await get(page);
		if (!resp.ok) return '';
		return (await resp.text()).match(BUTTON)?.[1] ?? '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const records = await json<Item[]>(`${REST_URL}/portfolio?per_page=100`);
	if (records.length === 0) {
		throw new Error('mcj: no companies in the portfolio collection');
	}

	const terms = new Map<number, string>();
	for (const taxonomy of TAXONOMIES) {
		for (const term of await json<{ id: number; name: string }[]>(`${REST_URL}/${taxonomy}?per_page=100`)) {
			terms.set(term.id, tag(term.name));
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const shown = clean(record.title?.rendered ?? '');
		const name = STORED_AS[shown.toLowerCase()] ?? shown;
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const page = record.link ?? '';
		await wait(PACE_MS);
		companies.push({
			name,
			category: TAXONOMIES.flatMap((t) => (record[t] ?? []).map((id) => terms.get(id) ?? ''))
				.filter(Boolean)
				.join(', '),
			url: (page && (await siteOf(page))) || page
		});
	}

	return companies;
}
