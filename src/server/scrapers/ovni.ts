import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.ovni.capital';
const CONFIG_URL = `${BASE_URL}/js/firebase-app.js`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// an exported webflow site with the portfolio filled in by the fund's own
// script. that script reads firestore and falls back to a file it keeps at
// /data/portfolio.json, and the two no longer agree: the file was written on
// 22 july and still carries a company the fund has since taken down, so it is
// the fallback rather than the portfolio. what firestore returns is what the
// page shows.
//
// the query here is the one the page makes for a reader who is not signed in —
// the companies marked visible. which project to ask, which database and which
// key to ask with are read from the fund's own script rather than written down
// here: they are the fund's to change, and a copy kept in this repository
// would be one more thing to go stale, as well as reading like a secret when
// it is only how their pages identify themselves.
//
// the fund files a company under one of three futures and writes where it is.
// it also keeps a list of industry tags, but those never reach the page: the
// script folds them into the hidden string its search box matches on, which is
// why they read as keywords rather than tags — defense beside defence, and a
// misspelled quauntum. so they are left out.

const KEY = /\bapiKey\s*:\s*['"]([^'"]+)['"]/;
const PROJECT = /\bprojectId\s*:\s*['"]([^'"]+)['"]/;
const DATABASE = /\bFIRESTORE_DATABASE_ID\s*=\s*['"]([^'"]+)['"]/;

// firestore writes a document as a field name over a typed value
interface Value {
	stringValue?: string;
	booleanValue?: boolean;
}

interface Row {
	document?: { fields?: Record<string, Value> };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Paris, France" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const text = (fields: Record<string, Value>, name: string) => clean(fields[name]?.stringValue ?? '');

// a company the fund no longer holds is marked on the card with a Past badge
const past = (fields: Record<string, Value>) => fields.past?.booleanValue === true;

// a few companies have no site written down, only the bare domain the fund
// files them under
const site = (fields: Record<string, Value>) => {
	const written = text(fields, 'website');
	if (written) return written;
	const domain = text(fields, 'domain');
	return domain ? `https://${domain.replace(/^https?:\/\//i, '')}` : '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const config = await fetch(CONFIG_URL, { headers: { 'User-Agent': UA } });
	if (!config.ok) {
		throw new Error(`Failed to fetch ${CONFIG_URL}: ${config.status}`);
	}
	const script = await config.text();

	const project = script.match(PROJECT)?.[1];
	const database = script.match(DATABASE)?.[1];
	const key = script.match(KEY)?.[1];
	if (!project || !database || !key) {
		throw new Error('ovni: the page no longer says which portfolio to ask for');
	}

	const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/${database}/documents:runQuery?key=${key}`;
	const resp = await fetch(url, {
		method: 'POST',
		headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId: 'companies' }],
				where: {
					fieldFilter: {
						field: { fieldPath: 'visible' },
						op: 'EQUAL',
						value: { booleanValue: true }
					}
				}
			}
		})
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch the ${project} portfolio: ${resp.status}`);
	}

	let rows: Row[];
	try {
		rows = (await resp.json()) as Row[];
	} catch {
		throw new Error('ovni: the portfolio came back in a shape that could not be read');
	}
	if (!Array.isArray(rows)) {
		throw new Error('ovni: the portfolio came back in a shape that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const fields = row.document?.fields;
		if (!fields) continue;

		const name = text(fields, 'name');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				tag(text(fields, 'categoryLabel')),
				tag([text(fields, 'hqCity'), text(fields, 'hqCountry')].filter(Boolean).join(', ')),
				past(fields) ? 'Past' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: site(fields)
		});
	}

	if (companies.length === 0) {
		throw new Error('ovni: no companies in the portfolio');
	}

	return companies;
}
