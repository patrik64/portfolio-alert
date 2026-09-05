import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.unusual.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const LIST_URL = `${BASE_URL}/wp-json/wp/v2/portfolio?per_page=100`;
const TERMS_URL = `${BASE_URL}/wp-json/wp/v2/portfolio-sectors?per_page=100`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the "portfolio" post type names the companies and carries their
// sectors, one of which is "Exited". what it does not carry is the company's
// own site — that is only in the page, inside the modal each logo opens, which
// the markup keys by the same slug the feed uses.
//
// asking for the terms alongside the posts (_embed) is refused here, so the
// sector names come from their own document.

interface Term {
	id: number;
	name?: string;
}

interface Post {
	title?: { rendered?: string };
	slug?: string;
	link?: string;
	'portfolio-sectors'?: number[];
}

// one address was saved as it was clicked on in an advert, tracking and all
const website = (raw: string) => {
	const [address, query] = raw.replace(/&#0?38;/g, '&').split('?');
	if (!query) return raw;
	const kept = query
		.split('&')
		.filter((param) => !/^(gclid|gbraid|wbraid|fbclid|msclkid|gad_[a-z_]*|utm_[a-z]*)=/i.test(param));
	return kept.length > 0 ? `${address}?${kept.join('&')}` : address;
};

async function fetchJson(url: string): Promise<unknown> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [posts, terms, html] = await Promise.all([
		fetchJson(LIST_URL) as Promise<Post[]>,
		fetchJson(TERMS_URL) as Promise<Term[]>,
		fetch(PAGE_URL, { headers: { 'User-Agent': UA } }).then((r) => {
			if (!r.ok) throw new Error(`Failed to fetch ${PAGE_URL}: ${r.status}`);
			return r.text();
		})
	]);

	const sectors = new Map((terms ?? []).map((t) => [t.id, (t.name ?? '').trim()]));

	// each modal is keyed by the company's slug and holds the one link that
	// leaves the site
	const sites = new Map<string, string>();
	for (const modal of html.split('class="portfolio-modal"').slice(1)) {
		const slug = modal.match(/id="([^"]+)"/)?.[1];
		if (!slug) continue;
		const site = [...modal.matchAll(/href="(https?:\/\/[^"]+)"/g)]
			.map((m) => m[1])
			.find((link) => !link.includes('unusual.vc'));
		if (site) sites.set(slug, website(site));
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts ?? []) {
		const name = (post.title?.rendered ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const tags = (post['portfolio-sectors'] ?? [])
			.map((id) => sectors.get(id) ?? '')
			.filter(Boolean)
			// "Exited" is a sector like the others here, and belongs last
			.sort((a, b) => Number(a === 'Exited') - Number(b === 'Exited'));
		companies.push({
			name,
			category: tags.join(', '),
			// a company whose modal links nowhere keeps its page on unusual.vc
			url: sites.get(post.slug ?? '') ?? post.link ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('unusual: no companies in the portfolio feed');
	}

	return companies;
}
