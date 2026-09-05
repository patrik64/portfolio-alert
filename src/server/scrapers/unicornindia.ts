import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.unicornivc.com/deep-tech-venture-capital-portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow: one row per company, all of them in the html. a row names
// the company and its sector, the round the fund came in at and which fund
// held it, then links the company's site ahead of its founders' linkedin
// profiles.
//
// the site marks no exits in any field — where a company has been acquired it
// says so only in the prose beneath the row, so that is where it is read from.

const ROW = 'class="collection-item-3 js-story-item w-dyn-item"';
const NAME = /class="text-block-25">([^<]*)</;
const SECTOR = /class="text-block-24 sector-value">([^<]*)</;
const FUND = /class="text-block-24 fund-value">([^<]*)</;
// the plain cells are the year founded, the year invested and the round
const CELLS = /class="text-block-24">([^<]*)</g;
const ACQUIRED = /\b(?:was acquired|acquired by)\b/i;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const name = (row.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		// a year is a year; the round is the cell that is not one
		const stage = [...row.matchAll(CELLS)]
			.map((m) => m[1].trim())
			.find((cell) => cell && !/^\d{4}$/.test(cell));

		const tags = [
			(row.match(SECTOR)?.[1] ?? '').trim(),
			stage ?? '',
			(row.match(FUND)?.[1] ?? '').trim(),
			ACQUIRED.test(row) ? 'Acquired' : ''
		].filter(Boolean);

		companies.push({
			name,
			category: tags.join(', '),
			// the founders' profiles follow the company's own address
			url:
				[...row.matchAll(/href="(https?:\/\/[^"]+)"/g)]
					.map((m) => m[1])
					.find((link) => !/linkedin\.com|unicornivc\.com/.test(link)) ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('unicornindia: no companies on the portfolio page');
	}

	return companies;
}
