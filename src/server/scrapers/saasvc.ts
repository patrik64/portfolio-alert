import type { ScrapedCompany } from './types';

const TABLE_URL =
	'https://ttrfqqlzmwyfazjqbwke.supabase.co/rest/v1/portfolio_companies?select=name,category,website,acquired&order=sort_order';
// the anon key the site's own javascript carries, which is what reads this
// table in a browser
const ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0cmZxcWx6bXd5ZmF6anFid2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyOTY5OTksImV4cCI6MjA5Mjg3Mjk5OX0.-QMj-je59Uo8yH8thEbVIAPU6QY0EcDMSTzx6YAhLTM';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a react app that reads its portfolio straight from a supabase
// table, so that table is read the same way.
//
// its category column mostly holds a sector but sometimes holds "Lead: Accel",
// naming whoever led the round rather than saying anything about the company;
// those are dropped. a separate flag marks the companies that have been bought.
//
// the addresses are written without a scheme, "www.huntress.com", so one is put
// in front where it is missing.

interface Row {
	name?: string;
	category?: string | null;
	website?: string | null;
	acquired?: boolean | null;
}

const LEAD_INVESTOR = /^lead\s*:/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function website(raw: string): string {
	const text = clean(raw);
	if (!text) return '';
	try {
		return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).toString();
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(TABLE_URL, {
		headers: { 'User-Agent': UA, apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${TABLE_URL}: ${resp.status}`);
	}
	const rows: Row[] = await resp.json();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of Array.isArray(rows) ? rows : []) {
		const name = clean(row.name ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const sector = clean(row.category ?? '');
		companies.push({
			name,
			category: [LEAD_INVESTOR.test(sector) ? '' : sector, row.acquired ? 'Acquired' : '']
				.filter(Boolean)
				.join(', '),
			url: website(row.website ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('saasvc: no companies in the portfolio table');
	}

	return companies;
}
