import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.amadeuscapital.com';
const PAGE_URL = `${BASE_URL}/our-companies/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the companies page draws its grid, eight pages of it, from a
// post type of companies the site's own api serves whole. a company is
// filed under one of the fund's three areas ("Intelligence", "Human",
// "Planet"), kept as tags, and as "Current" or among the "Success Stories",
// the fund's word for the ones it is out of. a current company's write-up
// links its site; a success story's tells how it went ("Acquired by Intel
// in 2013", "floated on NASDAQ"), the buyer kept with the Exited tag, and
// it links the company's page here instead.

const AREA_IDS = 'area';
const SITUATION_IDS = 'situation';
const SUCCESS = /^success stories$/i;
const LINK = /href="(https?:\/\/[^"]+)"/g;
// a profile on someone else's site, or the fund's own pages, is not the company's site
const NOT_A_SITE =
	/(?:^|\.)(?:amadeuscapital\.com|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|crunchbase\.com|medium\.com)$/i;
// "Acquired by Intel in 2013", "acquired in 2015 by Apple"
const BUYER =
	/\b[Aa]cquired\b(?:\s+in\s+(?:\w+\s+)?\d{4})?\s+by\s+([A-Z][^.,;()]*?)(?=\s+(?:in|for|to|and|as|which|after)\b|[.,;()]|$)/;
const LISTED = /\b(?:floated|listed|ipo|went public)\b/i;
const STEALTH = /^stealth\b/i;

interface Term {
	id?: number;
	name?: string;
}

interface Company {
	link?: string;
	title?: { rendered?: string };
	excerpt?: { rendered?: string };
	content?: { rendered?: string };
	area?: number[];
	situation?: number[];
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#8211;/g, '–')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
};

async function fetchJson<T>(url: string): Promise<T> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return (await resp.json()) as T;
}

// the names of a taxonomy's terms, by id
async function terms(taxonomy: string): Promise<Map<number, string>> {
	const list = await fetchJson<Term[]>(`${API_URL}/${taxonomy}?per_page=100&_fields=id,name`);
	return new Map(list.flatMap((t) => (t.id && t.name ? [[t.id, clean(t.name)]] : [])));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [areas, situations] = await Promise.all([terms(AREA_IDS), terms(SITUATION_IDS)]);
	if (areas.size === 0 || situations.size === 0) {
		throw new Error("amadeus: the api names no areas or no situations — the site's filters moved");
	}

	// every company, a hundred to a page of the api, read until a page comes short
	const all: Company[] = [];
	for (let page = 1; page <= 20; page++) {
		const resp = await fetch(
			`${API_URL}/company?per_page=100&page=${page}&_fields=link,title,excerpt,content,area,situation`,
			{ headers: { 'User-Agent': UA } }
		);
		if (!resp.ok) {
			throw new Error(`amadeus: the companies api answered ${resp.status} on page ${page}`);
		}
		const list = (await resp.json()) as Company[];
		all.push(...list);
		const pages = Number(resp.headers.get('x-wp-totalpages') ?? 1);
		if (page >= pages || list.length < 100) break;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of all) {
		const name = clean(company.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const out = (company.situation ?? []).some((id) => SUCCESS.test(situations.get(id) ?? ''));
		const story = clean(company.excerpt?.rendered ?? '');
		const buyer = out ? (story.match(BUYER)?.[1]?.trim() ?? '') : '';
		const site = [...(company.content?.rendered ?? '').matchAll(LINK)]
			.map(([, href]) => unescape(href).trim())
			.find((href) => {
				const host = hostOf(href);
				return host && !NOT_A_SITE.test(host);
			});

		companies.push({
			name,
			category: [
				...(company.area ?? []).map((id) => tag(areas.get(id) ?? '')),
				buyer ? `Acquired by ${tag(buyer)}` : out && LISTED.test(story) ? 'IPO' : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, list) => t && list.indexOf(t) === i)
				.join(', '),
			url: site || company.link || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('amadeus: the companies api named no companies');
	}

	return companies;
}
