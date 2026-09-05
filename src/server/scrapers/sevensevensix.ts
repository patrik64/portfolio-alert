import type { ScrapedCompany } from './types';

const API_URL = 'https://api.cerebro.ai/sevensevensix/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a react app that serves an empty shell and fetches its portfolio
// from cerebro, the software the fund built for itself. the endpoint answers
// with the whole list at once: a name, an emoji, and an address.
//
// the fund writes two things into the name that have to come out of it, or a
// company would read as new the day its circumstances changed: "(Acq. by xAI)"
// where it has been bought, which moves into the category, and "(FKA Athelas)"
// where it has renamed, which is the old name and is dropped.

const ACQUIRED = /\s*\(acq(?:uired)?\.?\s*by\s+([^)]*)\)\s*$/i;
const FORMERLY = /\s*\((?:fka|f\/k\/a|formerly)[^)]*\)\s*$/i;

interface Company {
	name?: string;
	website?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(API_URL, {
		headers: { 'User-Agent': UA, Origin: 'https://sevensevensix.com' }
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
	}
	const rows: Company[] = await resp.json();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of Array.isArray(rows) ? rows : []) {
		const written = clean(row.name ?? '');
		const acquirer = written.match(ACQUIRED)?.[1];
		const name = clean(written.replace(ACQUIRED, '').replace(FORMERLY, ''));
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: acquirer ? `Acquired by ${clean(acquirer)}` : '',
			url: row.website ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('sevensevensix: no companies in the portfolio api');
	}

	return companies;
}
