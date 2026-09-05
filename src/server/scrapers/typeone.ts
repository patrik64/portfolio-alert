import type { ScrapedCompany } from './types';

const API_URL = 'https://type1ventures.cdn.prismic.io/api/v2';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PAGE_SIZE = 100;

// prismic: the page renders in the browser, so the companies are read from the
// repository's public api — the "project" type, with each one's category
// fetched along with it rather than looked up afterwards.
//
// the stage field mostly names a round, but for one company it says "Acquired"
// instead; that is a standing, not a round, and becomes the house tag. the
// fund writes some rounds two ways ("Pre-Seed" and "Pre-seed"), which is left
// as it writes them — the search matches either way.

interface Doc {
	data?: {
		name?: { text?: string }[];
		stage?: string;
		founded?: string;
		website?: { url?: string };
		category?: { data?: { name?: string } };
	};
}

async function fetchJson(url: string): Promise<unknown> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	// every query is answered against a named version of the repository
	const api = (await fetchJson(API_URL)) as { refs?: { ref?: string }[] };
	const ref = api.refs?.[0]?.ref;
	if (!ref) {
		throw new Error('typeone: the prismic api named no ref');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let page = 1; page <= 10; page++) {
		const url = new URL(`${API_URL}/documents/search`);
		url.searchParams.set('ref', ref);
		url.searchParams.set('q', '[[at(document.type,"project")]]');
		url.searchParams.set('pageSize', String(PAGE_SIZE));
		url.searchParams.set('page', String(page));
		url.searchParams.set('fetchLinks', 'project_category.name');

		const body = (await fetchJson(url.href)) as { results?: Doc[]; total_pages?: number };
		for (const doc of body.results ?? []) {
			const name = (doc.data?.name?.[0]?.text ?? '').trim();
			if (!name || seen.has(name)) continue;
			seen.add(name);

			const stage = (doc.data?.stage ?? '').trim();
			companies.push({
				name,
				category: [
					(doc.data?.category?.data?.name ?? '').trim(),
					/^acquired$/i.test(stage) ? 'Acquired' : stage
				]
					.filter(Boolean)
					.join(', '),
				url: (doc.data?.website?.url ?? '').trim()
			});
		}
		if (page >= (body.total_pages ?? 1)) break;
	}

	if (companies.length === 0) {
		throw new Error('typeone: no companies in the prismic repository');
	}

	return companies;
}
