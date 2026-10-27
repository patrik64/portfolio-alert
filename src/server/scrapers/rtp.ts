import type { ScrapedCompany } from './types';

const DATA_URL = 'https://rtp.vc/rtp-global.json';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site, rebuilt in october 2026, publishes the firm, its team and its
// whole portfolio as one json file for machines to read, linked from its
// robots.txt. every company is named, with its own address (eight have
// none), its sectors, the region it sits in, the round the fund came in
// at, and whether it is live or exited. the old page never named a
// company, and the scraper spelled names out of domains and logo
// filenames; where the site's name differs from the one stored, the stored
// one is kept.
const STORED_AS: Record<string, string> = {};

interface Item {
	name?: string;
	website?: string | null;
	sectors?: string[];
	region?: string;
	stageAtFirstInvestment?: string;
	status?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(DATA_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	const items = ((await resp.json()) as { portfolio?: Item[] }).portfolio ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const shown = clean(item.name ?? '');
		const name = STORED_AS[shown.toLowerCase()] ?? shown;
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = clean(item.website ?? '');
		companies.push({
			name,
			category: [
				...(item.sectors ?? []).map(tag),
				tag(item.region ?? ''),
				tag(item.stageAtFirstInvestment ?? ''),
				/^exited$/i.test(item.status ?? '') ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('rtp: no companies in the site data — the file moved');
	}

	return companies;
}
