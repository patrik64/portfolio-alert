import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://quiet.com/portfolio/';
const API_URL = 'https://quiet.com/wp-json/wp/v2';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PER_PAGE = 100;

// wordpress, and the portfolio is split between two places. the grid on the
// page is logos and nothing else — every one of them carries the same
// placeholder alt text — but each logo names the post it belongs to and the
// company's own address, which is the only place that address appears. the
// rest api holds the names and sectors.
//
// so: the api for who a company is, the page for where it lives, joined on the
// post id.
//
// the api's other taxonomy, portfolio-tier, ranks companies one to three. that
// is how large the fund draws a logo, not anything about the company, so it is
// left out.

const LINK =
	/data-target-id="qc_portfolio_chunk_content_item_(\d+)"[\s\S]{0,600}?data-redirect-to="([^"]*)"/g;

interface Term {
	id: number;
	name: string;
}

interface Post {
	id: number;
	title: { rendered: string };
	'portfolio-type'?: number[];
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

// the site answers 429 to anything resembling a burst, and relents after a few
// seconds of patience
async function fetchPage(url: string): Promise<string> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			const resp = await fetch(url, { headers: { 'User-Agent': UA } });
			if (!resp.ok) {
				const err = new Error(`Failed to fetch ${url}: ${resp.status}`);
				if (resp.status === 429 && attempt < 5) {
					lastError = err;
					await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
					continue;
				}
				throw err;
			}
			return await resp.text();
		} catch (err) {
			lastError = err;
			if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
		}
	}
	throw lastError;
}

const fetchJson = async (url: string) => JSON.parse(await fetchPage(url));

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchPage(PAGE_URL);
	const sites = new Map([...html.matchAll(LINK)].map((m) => [m[1], m[2]]));

	const terms: Term[] = await fetchJson(`${API_URL}/portfolio-type?per_page=${PER_PAGE}`);
	const sector = new Map(terms.map((t) => [t.id, clean(t.name)]));

	// the grid renders every company twice, once for each breakpoint, so its
	// logo count is no guide to how many there are; the api's own paging is
	const posts: Post[] = [];
	for (let page = 1; page <= 20; page++) {
		const batch: Post[] = await fetchJson(
			`${API_URL}/portfolio?per_page=${PER_PAGE}&page=${page}&_fields=id,title,portfolio-type`
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
			category: (post['portfolio-type'] ?? [])
				.map((id) => sector.get(id) ?? '')
				.filter(Boolean)
				.join(', '),
			url: sites.get(String(post.id)) ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('quiet: no companies in the portfolio api');
	}

	return companies;
}
