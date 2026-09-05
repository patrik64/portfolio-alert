import type { ScrapedCompany } from './types';

const API_URL = 'https://www.qualcommventures.com/wp-json/wp/v2';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PER_PAGE = 100;

// wordpress. the portfolio page renders only the companies the fund has
// flagged as featured — forty-seven of two hundred and fifty-five — so the
// rest api is the list, and the page is no use.
//
// each company is filed under sectors, a region, and a status of active,
// acquired or ipo.
//
// the company's address is read from the text of the first paragraph of its
// slide-in rather than from the link wrapped around it, because several of
// those links are wrong in ways the text is not: the fund has pasted ring.com
// over accuvally's and gaikai's, zoom.us over enlightxr's, and given
// ethernovia a doubled scheme. what the page reads out is what the fund means.

interface Term {
	id: number;
	name: string;
}

interface Post {
	title: { rendered: string };
	content: { rendered: string };
	sector?: number[];
	region?: number[];
	'company-status'?: number[];
}

// the address sits in the paragraph following the company's heading; the
// social links live further down, in a column of their own
const WEBSITE =
	/<h2[^>]*>[\s\S]*?<\/h2>\s*<p[^>]*class="[^"]*wp-block-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/;
const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

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

function websiteOf(content: string): string {
	const text = clean(content.match(WEBSITE)?.[1] ?? '');
	if (!text) return '';
	const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
	try {
		const parsed = new URL(withScheme);
		// a paragraph holding prose rather than an address names no site
		if (!HOSTNAME.test(parsed.hostname)) return '';
		return parsed.origin + parsed.pathname;
	} catch {
		return '';
	}
}

async function fetchJson(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json();
}

async function termNames(taxonomy: string): Promise<Map<number, string>> {
	const terms: Term[] = await fetchJson(`${API_URL}/${taxonomy}?per_page=${PER_PAGE}&_fields=id,name`);
	return new Map(terms.map((t) => [t.id, clean(t.name)]));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [sectors, regions, statuses] = await Promise.all([
		termNames('sector'),
		termNames('region'),
		termNames('company-status')
	]);

	const posts: Post[] = [];
	for (let page = 1; page <= 20; page++) {
		const batch: Post[] = await fetchJson(
			`${API_URL}/companies?per_page=${PER_PAGE}&page=${page}` +
				'&_fields=title,content,sector,region,company-status'
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

		const status = (post['company-status'] ?? [])
			.map((id) => statuses.get(id) ?? '')
			// "Active" is what a company still held reads
			.map((s) => (/^active$/i.test(s) ? '' : /^ipo$/i.test(s) ? 'Exited' : s));

		companies.push({
			name,
			category: [
				...(post.sector ?? []).map((id) => sectors.get(id) ?? ''),
				...(post.region ?? []).map((id) => regions.get(id) ?? ''),
				...status
			]
				.filter(Boolean)
				.join(', '),
			url: websiteOf(post.content?.rendered ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('qualcomm: no companies in the portfolio api');
	}

	return companies;
}
