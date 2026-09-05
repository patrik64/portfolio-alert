import type { ScrapedCompany } from './types';

const API_URL = 'https://sante.com/wp-json/wp/v2';
// the site's firewall answers 403 to chrome user-agent strings and lets safari
// through, as vamosventures' and stray dog's do
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const PER_PAGE = 100;
const BATCH_SIZE = 10;

// wordpress. the portfolio page is a grid of logos with no alt text, so the
// rest api is read instead: it names every company and files it under one of
// the fund's three sectors — biotech, healthtech, medtech.
//
// the firewall also refuses datacenter addresses, as blume's and speedinvest's
// do, so this one answers from a laptop and fails from production.
//
// the company's own address is not in the api, only on the write-up each tile
// links to, where it is the single link leaving the fund's site. those pages
// are fetched for it; a few companies have none, and keep no address.

interface Term {
	id: number;
	name: string;
}

interface Post {
	title?: { rendered?: string };
	link?: string;
	sectors?: number[];
}

const LINK = /href="(https?:\/\/[^"]+)"/g;
const OFF_SITE = /sante\.com|w3\.org|gmpg\.org|gravatar|google/i;

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

// the firewall turns a blocked address away with a page and a 200 rather than
// a refusal, so html where json was asked for means the request never reached
// the api
async function fetchJson(url: string) {
	const body = await fetchText(url);
	if (/^\s*</.test(body)) {
		throw new Error(
			'sante: answered with a page instead of json — the site only answers fetches run locally'
		);
	}
	return JSON.parse(body);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [terms, rows]: [Term[], Post[]] = await Promise.all([
		fetchJson(`${API_URL}/sectors?per_page=${PER_PAGE}&_fields=id,name`),
		fetchJson(`${API_URL}/companies?per_page=${PER_PAGE}&_fields=title,link,sectors`)
	]);
	const sectors = new Map(terms.map((t) => [t.id, clean(t.name)]));

	const listed: { name: string; category: string; page: string }[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.title?.rendered ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		listed.push({
			name,
			category: (row.sectors ?? [])
				.map((id) => sectors.get(id) ?? '')
				.filter(Boolean)
				.join(', '),
			page: row.link ?? ''
		});
	}

	if (listed.length === 0) {
		throw new Error('sante: no companies in the portfolio api');
	}

	const companies: ScrapedCompany[] = listed.map((c) => ({
		name: c.name,
		category: c.category,
		url: ''
	}));

	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((c) => (c.page ? fetchText(c.page).catch(() => '') : Promise.resolve('')))
		);
		pages.forEach((page, j) => {
			const off = [...page.matchAll(LINK)].map((m) => m[1]).find((u) => !OFF_SITE.test(u));
			companies[i + j].url = off ?? '';
		});
	}

	return companies;
}
