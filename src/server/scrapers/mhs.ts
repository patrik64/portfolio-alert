import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.mhscapital.com/';
const API_URL = 'https://xjvk-dhco-sxr0.n7c.xano.io/api:mhs-capital-site/portfolio';

// a single page since the october 2026 rebuild, its portfolio no longer the
// wordpress wall of thirty-eight logos but the eleven companies the fund
// features, which its script reads from a xano table on every visit — the
// list written into the page is only the build's copy of it — so the table is
// read here too, through the same public endpoint, every row with a name in
// it shown as the page shows it. a company's name links its site, which for
// one sold is often its buyer's; the stage and year the fund came in are kept
// as tags, as is the outcome the page tags it with, "IPO" or "M&A" an exit
// and "M&A Pending" not yet one.

interface Row {
	company_name?: string;
	website?: string;
	outcome?: string;
	entry_stage?: string;
	entry_year?: number;
}

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) =>
	s
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(API_URL, { headers: { Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
	}
	const rows = (await resp.json()) as Row[];
	if (!Array.isArray(rows)) {
		throw new Error('mhs: the portfolio api did not answer with a list');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = tag(row.company_name ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// "Seed and Series A" -> "Seed", as the page reads it
		const stage = (row.entry_stage ?? '').split(/,|\band\b/).map(tag).find(Boolean) ?? '';
		const outcome = tag(row.outcome ?? '');
		const site = (row.website ?? '').trim();
		companies.push({
			name,
			category: [
				stage,
				row.entry_year ? `Invested ${row.entry_year}` : '',
				outcome,
				outcome && !/pending/i.test(outcome) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('mhs: the portfolio api named no companies');
	}

	return companies;
}
