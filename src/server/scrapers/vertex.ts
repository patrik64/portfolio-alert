import type { ScrapedCompany } from './types';

const SITE_URL = 'https://www.vertexventures.co.il';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a Gatsby build over Storyblok: the portfolio ships as
// data_project nodes inside the page's static-query JSON files (listed by
// hash in page-data.json). each node carries the name, a category list mixing
// sectors with statuses, and the company site among its social links

interface Project {
	_uid?: string;
	component?: string;
	project_name?: string;
	project_category?: string[];
	project_socials?: { type?: string; url?: string }[];
}

// statuses mixed into the category list that say nothing about the company
const NON_CATEGORIES = new Set(['active', 'recent', 'stealth']);

function* findProjects(node: unknown): Generator<Project> {
	if (Array.isArray(node)) {
		for (const item of node) yield* findProjects(item);
	} else if (node && typeof node === 'object') {
		const content = (node as { content?: unknown }).content;
		if (typeof content === 'string' && content.includes('"data_project"')) {
			yield JSON.parse(content) as Project;
		}
		for (const value of Object.values(node)) yield* findProjects(value);
	}
}

async function fetchJson<T>(url: string): Promise<T> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json() as Promise<T>;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const pageData = await fetchJson<{ staticQueryHashes?: string[] }>(
		`${SITE_URL}/page-data/index/page-data.json`
	);
	const hashes = pageData.staticQueryHashes ?? [];
	if (hashes.length === 0) {
		throw new Error('vertex: page-data lists no static queries');
	}

	const byUid = new Map<string, Project>();
	for (const data of await Promise.all(
		hashes.map((h) => fetchJson<unknown>(`${SITE_URL}/page-data/sq/d/${h}.json`))
	)) {
		for (const project of findProjects(data)) {
			byUid.set(project._uid ?? JSON.stringify(project.project_name), project);
		}
	}

	const companies: ScrapedCompany[] = [];
	for (const project of byUid.values()) {
		const name = (project.project_name ?? '').trim();
		// unannounced placeholder cards are literally named "Stealth"
		if (!name || /^stealth$/i.test(name)) continue;
		companies.push({
			name,
			category: (project.project_category ?? [])
				.map((c) => c.trim())
				.filter((c) => c && !NON_CATEGORIES.has(c.toLowerCase()))
				.join(', '),
			url: project.project_socials?.find((s) => s.type === 'website' && s.url)?.url ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('vertex: no companies found in the static queries');
	}

	return companies;
}
