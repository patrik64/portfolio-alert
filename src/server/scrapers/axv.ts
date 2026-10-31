import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.axv.vc';
const PAGE_URL = `${BASE_URL}/`;
const DATA_URL = `${BASE_URL}/portfolio-data.json`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// on 2026-10-30 the fund swapped its react page for a hand-made one: the cards
// are written into the page, and what a card opens on comes from
// portfolio-data.json, a record per company with its name, its fields ("Space ·
// Infrastructure") and its site. the fields are kept as tags. the old page gave
// the stage and the year founded too; the new one says neither, and nothing
// marks an exit. an address the site does not have answers 200 with the page
// itself, so a file that has moved comes back as something other than json.

interface Record_ {
	name?: string;
	sector?: string;
	website?: string;
}

const STEALTH = /^stealth\b/i;

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(DATA_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	if (!resp.headers.get('content-type')?.includes('json')) {
		throw new Error('axv: the portfolio records are no longer at portfolio-data.json');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of (await resp.json()) as Record_[]) {
		const name = (record.name ?? '').replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: (record.sector ?? '')
				.split(/\s*·\s*/)
				.map(tag)
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: (record.website ?? '').trim() || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('axv: no companies in the portfolio records');
	}

	return companies;
}
