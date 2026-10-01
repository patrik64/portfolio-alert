import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.axv.vc';
const PAGE_URL = `${BASE_URL}/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// react, compiled in the browser: the site is one empty page whose scripts
// draw it, the portfolio from a file of records the page loads as source,
// each a company with its name, its fields ("Space · Infrastructure"),
// the stage it is at, the year it was founded and its site, written
// without "https://". the fields and the stage are kept as tags, with
// "Founded 2021". the file's name carries a version the page bumps, so the
// page is read for it each run. nothing marks an exit.

const DATA_SCRIPT = /<script\b[^>]*\bsrc="([^"]*PortfolioData[^"]*)"/;
const RECORD = /(?=\bslug:\s*")/;
const FIELD = (key: string) => new RegExp(`\\b${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
const STEALTH = /^stealth\b/i;

// a javascript string's contents, its escapes undone where json reads them
const unquote = (s: string) => {
	try {
		return JSON.parse(`"${s}"`) as string;
	} catch {
		return s;
	}
};

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(PAGE_URL);
	const script = shell.match(DATA_SCRIPT)?.[1];
	if (!script) {
		throw new Error('axv: the page no longer loads its portfolio records');
	}
	const data = await fetchText(new URL(script, PAGE_URL).href);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of data.split(RECORD).slice(1)) {
		const field = (key: string) => unquote(record.match(FIELD(key))?.[1] ?? '').trim();
		const name = field('co').replace(/\s+/g, ' ');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const founded = field('founded').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = field('website');
		companies.push({
			name,
			category: [...field('sector').split(/\s*·\s*/).map(tag), tag(field('stage')), founded ? `Founded ${founded}` : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: !site ? PAGE_URL : /^https?:\/\//i.test(site) ? site : `https://${site.replace(/^\/+/, '')}`
		});
	}
	if (companies.length === 0) {
		throw new Error('axv: no companies in the portfolio records');
	}

	return companies;
}
