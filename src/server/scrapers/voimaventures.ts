import type { ScrapedCompany } from './types';

const BASE_URL = 'https://voimaventures.com';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress (Avada): /portfolio/ renders every company as a fusion-portfolio-post
// card, but the cards only link the fund's own portfolio-item pages. the same
// posts come out of the REST API in one request, content included — and the
// content holds the single outbound link to the company's site, so the 51 cards
// resolve without fetching 51 detail pages (~1.1MB each). the portfolio_category
// taxonomy carries both the sector tags and the fund vintage ("Fund II"), plus
// "Exited", which is moved to the end of the tag list.
const LIST_URL = `${BASE_URL}/wp-json/wp/v2/avada_portfolio?per_page=100`;
const CATEGORY_URL = `${BASE_URL}/wp-json/wp/v2/portfolio_category?per_page=100`;

interface Term {
	id: number;
	name?: string;
}

interface PortfolioPost {
	link?: string;
	title?: { rendered?: string };
	content?: { rendered?: string };
	portfolio_category?: number[];
}

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#8217;|&#39;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchJson(url: string): Promise<unknown> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json();
}

// the description body links the company site and nothing else; social profiles
// only ever appear in the site chrome, but are skipped defensively. the match is
// on the host, not the raw href — "x.com" as a substring would otherwise swallow
// dispelix.com and quantrolox.com
const SKIP_HOSTS =
	/^(voimaventures\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com|instagram\.com|youtube\.com)$/i;

function siteFor(content: string): string {
	for (const [, href] of content.matchAll(/href=["']?(https?:\/\/[^"'\s>]+)/g)) {
		let host: string;
		try {
			host = new URL(href).hostname.replace(/^www\./, '');
		} catch {
			continue;
		}
		if (SKIP_HOSTS.test(host)) continue;
		return href;
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [posts, terms] = (await Promise.all([fetchJson(LIST_URL), fetchJson(CATEGORY_URL)])) as [
		PortfolioPost[],
		Term[]
	];

	const labels = new Map<number, string>();
	for (const t of terms ?? []) labels.set(t.id, decode(t.name ?? ''));

	const companies: ScrapedCompany[] = [];
	for (const post of posts ?? []) {
		const name = decode(post.title?.rendered ?? '');
		if (!name) continue;
		const tags = (post.portfolio_category ?? [])
			.map((id) => labels.get(id) ?? '')
			.filter(Boolean)
			.sort((a, b) => Number(a === 'Exited') - Number(b === 'Exited') || a.localeCompare(b));
		companies.push({
			name,
			category: tags.join(', '),
			// five companies carry no outbound link (mostly older exits); they
			// keep the fund's own portfolio-item page
			url: siteFor(post.content?.rendered ?? '') || (post.link ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('voimaventures: no companies in the portfolio feed');
	}

	return companies;
}
