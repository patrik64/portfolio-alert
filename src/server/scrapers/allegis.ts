import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.allegiscyber.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// vite: the portfolio page is an empty shell its script fills with a
// table of companies compiled into it, each with its name, its chief
// executive and founders, its industry ("Security", "Fintech"), the year
// the fund partnered with it, a link and a line about it. the industry is
// kept as a tag and the year as "Invested 2016"; a line that says the
// company was "acquired by" someone is how the fund got out, kept as
// "Acquired by Cisco", and its link is the buyer's site, as the table
// gives it. the script's name is hashed per build, so the shell is read
// for it each run.

const SCRIPT = /<script\b[^>]*\bsrc="(\/assets\/[^"]+\.js)"/g;
// a company: a flat record opening with its name, its values strings,
// numbers, or nothing ("link:null")
const RECORD = /\{company:"(?:[^"\\]|\\.)*"(?:,\w+:(?:"(?:[^"\\]|\\.)*"|[\d.e]+|null|void 0|!0|!1))*\}/g;
const FIELD = /(\w+):(?:"((?:[^"\\]|\\.)*)"|([\d.e]+))/g;
const BUYER = /\bacquired by ([^.]+?)\s*\.?\s*$/i;
const STEALTH = /^stealth\b/i;

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

// a javascript string's contents, its escapes undone where json reads them
const unquote = (s: string) => {
	try {
		return JSON.parse(`"${s}"`) as string;
	} catch {
		return s;
	}
};

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(PAGE_URL);
	const scripts = [...new Set([...shell.matchAll(SCRIPT)].map(([, src]) => src))];
	let records: Map<string, string>[] = [];
	for (const script of scripts) {
		records = [...(await fetchText(`${BASE_URL}${script}`)).matchAll(RECORD)].map(
			([record]) =>
				new Map([...record.matchAll(FIELD)].map(([, key, text, number]) => [key, text !== undefined ? unquote(text) : number]))
		);
		if (records.length > 0) break;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const fields of records) {
		const name = (fields.get('company') ?? '').replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const buyer = (fields.get('tldr') ?? '').match(BUYER)?.[1];
		const year = Number(fields.get('year'));
		const site = (fields.get('link') ?? '').trim();
		companies.push({
			name,
			category: [
				tag(fields.get('industry') ?? ''),
				year >= 1900 && year < 2100 ? `Invested ${year}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				buyer ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('allegis: no script on the portfolio page carries the companies');
	}

	return companies;
}
