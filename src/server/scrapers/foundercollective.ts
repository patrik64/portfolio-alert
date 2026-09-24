import type { ScrapedCompany } from './types';

const BASE_URL = 'https://foundercollective.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API = `${BASE_URL}/wp-json/wp/v2`;
const PER_PAGE = 100;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own. the portfolio page is a table of logos,
// each row with a line about the company, the year the fund came in, its
// links and, for one bought, the buyer ("Acquired: Airbnb") — but the name
// only ever in the logo. the rest api's portfolio type holds the same
// companies by the same ids, with their names and the fund's categories and
// places, so the two are read together: the names and labels from the api,
// the year, the site and the buyer from the row it keys.

const ROW = /(?=<div class="companiestable__item mix\b)/;
const ID = /data-target="#company-(\d+)"/;
const YEAR = /<h6 class="label[^"]*">\s*(\d{4})\s*<\/h6>/;
const SOLD = /<span class="categories">\s*Acquired:\s*([\s\S]*?)<\/span>/i;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="icon-link"/;
const STEALTH = /^stealth\b/i;

interface Post {
	id: number;
	title?: { rendered?: string };
	portfolio_category?: number[];
	location?: number[];
}

interface Term {
	id: number;
	name?: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchJson<T>(url: string): Promise<{ data: T; resp: Response }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return { data: (await resp.json()) as T, resp };
}

async function terms(taxonomy: string): Promise<Map<number, string>> {
	const { data } = await fetchJson<Term[]>(`${API}/${taxonomy}?per_page=100&_fields=id,name`);
	return new Map(data.map((term) => [term.id, tag(term.name ?? '')]));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [categories, places, page] = await Promise.all([
		terms('portfolio_category'),
		terms('location'),
		fetch(PAGE_URL, { headers: { 'User-Agent': UA } }).then((resp) => {
			if (!resp.ok) throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
			return resp.text();
		})
	]);

	const rows = new Map<number, string>();
	for (const row of page.split(ROW).slice(1)) {
		const id = Number(row.match(ID)?.[1]);
		if (id && !rows.has(id)) rows.set(id, row);
	}

	const posts: Post[] = [];
	let total = 0;
	for (let n = 1; n <= MAX_PAGES; n++) {
		const { data, resp } = await fetchJson<Post[]>(
			`${API}/portfolio?per_page=${PER_PAGE}&page=${n}&_fields=id,title,portfolio_category,location`
		);
		total = Number(resp.headers.get('x-wp-total')) || total;
		posts.push(...data);
		if (n >= (Number(resp.headers.get('x-wp-totalpages')) || 1)) break;
	}
	if (total > 0 && posts.length < total) {
		throw new Error(`foundercollective: read ${posts.length} of the ${total} companies listed`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const row = rows.get(post.id) ?? '';
		const buyer = clean(row.match(SOLD)?.[1] ?? '');
		const year = row.match(YEAR)?.[1];
		companies.push({
			name,
			category: [
				...(post.portfolio_category ?? []).map((id) => categories.get(id) ?? ''),
				...(post.location ?? []).map((id) => places.get(id) ?? ''),
				year ? `Invested ${year}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				buyer ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(row.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('foundercollective: the rest api lists no companies');
	}

	return companies;
}
