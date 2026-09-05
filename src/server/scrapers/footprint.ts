import type { ScrapedCompany } from './types';

// the portfolio page is drawn in the browser from the firm's sanity dataset,
// whose project and dataset its image addresses name
const PROJECT = '9wcgtbpq';
const DATASET = 'production';
const API_URL = `https://${PROJECT}.api.sanity.io/v2021-10-21/data/query/${DATASET}`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the firm keeps several document types about investing; the one that is a
// portfolio company is "investment-case", which carries the company's site,
// the vertical it works in and the round the firm came in at. an entry the
// firm has switched off is not shown on the page and is not counted here.
const QUERY = `*[_type=="investment-case" && !(_id in path("drafts.**")) && enabled != false]{
	title, websiteUrl, "verticals": verticals[]->title, "stages": stages[]->title
}`;

interface Case {
	title?: string;
	websiteUrl?: string;
	verticals?: (string | null)[];
	stages?: (string | null)[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const url = new URL(API_URL);
	url.searchParams.set('query', QUERY);

	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch the sanity dataset: ${resp.status}`);
	}
	const { result } = (await resp.json()) as { result?: Case[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of result ?? []) {
		// several titles are stored with a trailing space
		const name = (row.title ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [
				...(row.verticals ?? []).map((v) => (v ?? '').trim()),
				...(row.stages ?? []).map((s) => (s ?? '').trim())
			]
				.filter(Boolean)
				.join(', '),
			url: (row.websiteUrl ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('footprint: no investment cases in the sanity dataset');
	}

	return companies;
}
