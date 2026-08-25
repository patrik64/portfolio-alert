import type { ScrapedCompany } from './types';

const SITE_URL = 'https://glilotcapital.com';
const PAGE_URL = `${SITE_URL}/portfolio/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the portfolio page (WordPress + JetEngine) renders logo tiles that link each
// company's site but never name it — the names live in the "clubs" custom post
// type, which the wp REST api serves openly along with an Active/Acquired
// category. the tiles carry the post id, joining the two sources

interface ClubPost {
	id: number;
	title?: { rendered?: string };
	'clubs-category'?: number[];
}

async function fetchJson<T>(url: string): Promise<T> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json() as Promise<T>;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [html, terms] = await Promise.all([
		fetch(PAGE_URL, { headers: { 'User-Agent': UA } }).then((r) => {
			if (!r.ok) throw new Error(`Failed to fetch ${PAGE_URL}: ${r.status}`);
			return r.text();
		}),
		fetchJson<{ id: number; name: string }[]>(
			`${SITE_URL}/wp-json/wp/v2/clubs-category?per_page=100&_fields=id,name`
		)
	]);
	const termName = new Map(terms.map((t) => [t.id, decode(t.name)]));

	// the tiles: post id -> the company site its logo links
	const urlById = new Map<string, string>();
	for (const item of html.split(/<div class="jet-listing-grid__item(?!s)/).slice(1)) {
		const id = item.match(/data-post-id="(\d+)"/)?.[1];
		const href = item.match(/<a[^>]*href="(https?:\/\/[^"]+)"/)?.[1];
		if (id && href && !urlById.has(id)) urlById.set(id, href);
	}

	const companies: ScrapedCompany[] = [];
	for (let page = 1; ; page++) {
		const posts = await fetchJson<ClubPost[]>(
			`${SITE_URL}/wp-json/wp/v2/clubs?per_page=100&page=${page}&_fields=id,title,clubs-category`
		);
		for (const post of posts) {
			const name = decode(post.title?.rendered ?? '');
			// placeholder posts for unannounced companies ("Ai Era – Stealth",
			// one even titled "– Copy") carry no name or site — skip them
			if (!name || /stealth/i.test(name)) continue;
			companies.push({
				name,
				category: (post['clubs-category'] ?? [])
					.flatMap((id) => {
						const term = termName.get(id);
						// "Active" says nothing; "Acquired" is worth keeping
						return term && term !== 'Active' ? [term] : [];
					})
					.join(', '),
				url: urlById.get(String(post.id)) ?? ''
			});
		}
		if (posts.length < 100) break;
	}

	if (companies.length === 0) {
		throw new Error('glilot: no companies found in the clubs api');
	}

	return companies;
}
