import type { ScrapedCompany } from './types';

const BASE_URL = 'https://edovatecapital.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with divi: the portfolio page is a filterable grid of the
// site's "projects", which the rest api lists whole — the companies filed
// under "Current", "Exits" and, one of them, "Other", beside the books and
// consulting notes filed under the rest, which are left out. a project's
// content is a paragraph about the company, linking its site, and, on one
// sold, says how it went ("Acquired by Raptor Technologies"). the pages of
// the listing are followed to the last.

const PORTFOLIO = /^(current|exits|other)$/i;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const OUTCOME = /\b(acquired (?:by [^.<,;]+|in \d{4})|merged with [^.<,;]+|went public[^.<,;]*|ipo)/i;
const STEALTH = /^stealth\b/i;

interface Term {
	id: number;
	name: string;
}

interface Project {
	title?: { rendered?: string };
	link?: string;
	project_category?: number[];
	content?: { rendered?: string };
	status?: string;
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

async function fetchJson<T>(url: string): Promise<{ data: T; pages: number }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return { data: (await resp.json()) as T, pages: Number(resp.headers.get('x-wp-totalpages') ?? '1') || 1 };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const terms = (await fetchJson<Term[]>(`${API_URL}/project_category?per_page=100&_fields=id,name`)).data;
	const names = new Map(terms.map((term) => [term.id, clean(term.name)]));

	const projects: Project[] = [];
	for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
		const listing = await fetchJson<Project[]>(
			`${API_URL}/project?per_page=100&page=${page}&_fields=title,link,project_category,content,status`
		);
		projects.push(...listing.data);
		pages = listing.pages;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const project of projects) {
		const categories = (project.project_category ?? []).map((id) => names.get(id) ?? '');
		if (!categories.some((c) => PORTFOLIO.test(c))) continue;
		const name = clean(project.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const content = project.content?.rendered ?? '';
		const site = [...content.matchAll(LINK)].map((m) => unescape(m[1])).find((u) => !u.includes('edovatecapital.com'));
		const exited = categories.some((c) => /^exits$/i.test(c));
		const outcome = clean(content).match(OUTCOME)?.[1] ?? '';
		companies.push({
			name,
			category: [exited && outcome ? tag(outcome[0].toUpperCase() + outcome.slice(1)) : '', exited ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: site || project.link || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('edovate: no portfolio companies among the projects');
	}

	return companies;
}
