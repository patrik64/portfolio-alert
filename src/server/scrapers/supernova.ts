import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://supernovainvest.com/portfolio-sni/';
const API_URL = 'https://supernovainvest.com/wp-json/wp/v2';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PER_PAGE = 100;

// wordpress with a jetengine listing. the tiles on the page never write the
// company's name — the heading over each one is its sector, and the logo's alt
// is empty — but they do carry the post id and the link out to the company.
// the rest api has the names and the three taxonomies the fund files by:
// sector, subsector and country.
//
// so the api says who a company is and the page where it lives, joined on the
// post id that jetengine leaves on each tile.

const TILE = 'data-post-id="';
const SITE = /ekit_image_caption_button[^>]*href="(https?:\/\/[^"]+)"/;

interface Term {
	id: number;
	name: string;
}

interface Post {
	id: number;
	title: { rendered: string };
	sector?: number[];
	subsector?: number[];
	country?: number[];
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

const fetchJson = async (url: string) => JSON.parse(await fetchText(url));

async function termNames(taxonomy: string): Promise<Map<number, string>> {
	const terms: Term[] = await fetchJson(
		`${API_URL}/${taxonomy}?per_page=${PER_PAGE}&_fields=id,name`
	);
	return new Map(terms.map((t) => [t.id, clean(t.name)]));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const sites = new Map<string, string>();
	for (const tile of html.split(TILE).slice(1)) {
		const id = tile.match(/^(\d+)"/)?.[1];
		const site = tile.match(SITE)?.[1];
		if (id && site && !sites.has(id)) sites.set(id, site);
	}

	const [sectors, subsectors, countries] = await Promise.all([
		termNames('sector'),
		termNames('subsector'),
		termNames('country')
	]);

	const posts: Post[] = [];
	for (let page = 1; page <= 20; page++) {
		const batch: Post[] = await fetchJson(
			`${API_URL}/portfolio?per_page=${PER_PAGE}&page=${page}` +
				'&_fields=id,title,sector,subsector,country'
		);
		if (!Array.isArray(batch) || batch.length === 0) break;
		posts.push(...batch);
		if (batch.length < PER_PAGE) break;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [
				...(post.sector ?? []).map((id) => sectors.get(id) ?? ''),
				...(post.subsector ?? []).map((id) => subsectors.get(id) ?? ''),
				...(post.country ?? []).map((id) => countries.get(id) ?? '')
			]
				.filter(Boolean)
				.join(', '),
			url: sites.get(String(post.id)) ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('supernova: no companies in the portfolio api');
	}

	return companies;
}
