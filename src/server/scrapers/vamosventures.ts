import type { ScrapedCompany } from './types';

const BASE_URL = 'https://vamosventures.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const LIST_URL = `${BASE_URL}/wp-json/wp/v2/companies?per_page=100`;
const CATEGORY_URL = `${BASE_URL}/wp-json/wp/v2/business-category?per_page=100`;

// the host's WAF answers 403 to Chrome user agents — the shared Chrome string
// the other scrapers send is refused on every path, REST included, while Safari,
// Firefox and even a bare "curl/8.4.0" are served normally. hence a Safari UA
// here; it is still sent on every request.
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// wordpress + Elementor: the portfolio is an Elementor loop over a "companies"
// post type, rendered twice (desktop and mobile grids) into 59 cards for 30
// companies. the cards carry no company name — only a logo image with an empty
// alt, a tagline and the founders — so the names come from the post type's REST
// feed, which also carries the "business-category" sector terms. the outbound
// link to the company's own site exists only in the rendered card, so the two
// are joined on the post id that Elementor stamps as "e-loop-item-<id>".

interface Term {
	id: number;
	name?: string;
}

interface CompanyPost {
	id: number;
	link?: string;
	title?: { rendered?: string };
	'business-category'?: number[];
}

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#8217;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Referer: PAGE_URL } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// the waf sometimes answers the rest feed with a challenge page rather than
// json — status 200, body html — for a datacenter address. that mood passes,
// so it is retried once before the night is given up with a clear word
// instead of a parse error.
async function fetchJson<T>(url: string): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		const body = await fetchText(url);
		try {
			return JSON.parse(body) as T;
		} catch {
			if (attempt >= 1) {
				throw new Error('vamosventures: the rest feed answered a challenge page, not json');
			}
			await new Promise((resolve) => setTimeout(resolve, 10_000));
		}
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [html, posts, terms] = await Promise.all([
		fetchText(PAGE_URL),
		fetchJson<CompanyPost[]>(LIST_URL),
		fetchJson<Term[]>(CATEGORY_URL)
	]);

	const labels = new Map<number, string>();
	for (const term of terms ?? []) labels.set(term.id, decode(term.name ?? ''));

	// first outbound link inside each loop card is the company's own site
	const sites = new Map<string, string>();
	const cards = html.split(/e-loop-item-(\d+) post-\d+ companies/);
	for (let i = 1; i < cards.length; i += 2) {
		const id = cards[i];
		if (sites.has(id)) continue;
		for (const [, href] of cards[i + 1].matchAll(/href="(https?:\/\/[^"]*)"/g)) {
			if (href.includes('vamosventures.com')) continue;
			sites.set(id, href);
			break;
		}
	}

	const companies: ScrapedCompany[] = [];
	for (const post of posts ?? []) {
		const name = decode(post.title?.rendered ?? '');
		if (!name) continue;
		companies.push({
			name,
			category: (post['business-category'] ?? [])
				.map((id) => labels.get(id) ?? '')
				.filter(Boolean)
				.join(', '),
			url: sites.get(String(post.id)) || (post.link ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('vamosventures: no companies in the portfolio feed');
	}

	return companies;
}
