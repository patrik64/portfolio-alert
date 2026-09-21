import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.renewalfunds.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// since september 2026 the site is a small react app compiled in the browser:
// the page is an empty root and a list of scripts, and the portfolio is data
// in one of them — window.RF_FUNDS, the three funds (renewal2, 3 and 4) each
// with its companies: a name, a sentence or a paragraph about it, the
// company's site, and a flag on the ones the fund has exited. the write-ups
// the old wordpress site kept, with an industry and a town, are gone.
//
// the data is a javascript literal with comments and bare keys, not json, and
// it is somebody else's code: it is read with patterns that know what a
// string is, never run. the script is found through the page rather than by
// name, in case data.js is renamed.
//
// what the fund says about a company is prose, so the category is the fund
// that holds it and whether it has exited.

const SCRIPT = /<script[^>]*\bsrc="([^"]+\.jsx?)"/g;
const MARKER = 'RF_FUNDS';
const STR = String.raw`"(?:[^"\\]|\\.)*"`;
const FUND = new RegExp(String.raw`\{\s*id:\s*${STR}\s*,\s*name:\s*(${STR})`, 'g');
// a company is a flat record opening with its name; braces inside its prose
// are inside a string, and so do not end it
const RECORD = new RegExp(
	String.raw`\{\s*name:\s*${STR}(?:\s*,\s*\w+:\s*(?:${STR}|true|false|null|-?\d+(?:\.\d+)?))*\s*,?\s*\}`,
	'g'
);

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// a double-quoted javascript string is, near enough, a json one
const text = (literal: string) => {
	try {
		return String(JSON.parse(literal));
	} catch {
		return literal.slice(1, -1);
	}
};

const field = (record: string, key: string) =>
	record.match(new RegExp(String.raw`\b${key}:\s*(${STR}|true|false)`))?.[1];

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const page = await resp.text();

	// the site's own scripts, in the order the page loads them
	let data = '';
	for (const [, src] of page.matchAll(SCRIPT)) {
		if (/^https?:\/\//i.test(src)) continue;
		const script = await fetchText(new URL(src, resp.url).href).catch(() => '');
		if (script.includes(MARKER)) {
			data = script;
			break;
		}
	}
	const start = data.indexOf(MARKER);
	if (start < 0) {
		throw new Error('renewal: none of the page’s scripts holds the portfolio');
	}
	// the funds end where the next of the site's lists begins
	const end = data.indexOf('window.', start + MARKER.length);
	const section = data.slice(start, end < 0 ? undefined : end);

	const funds = [...section.matchAll(FUND)].map((m) => ({ at: m.index, name: clean(text(m[1])) }));
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	funds.forEach((fund, i) => {
		for (const [record] of section.slice(fund.at, funds[i + 1]?.at).matchAll(RECORD)) {
			const name = clean(text(field(record, 'name') ?? '""'));
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			companies.push({
				name,
				category: [fund.name, field(record, 'exited') === 'true' ? 'Exited' : '']
					.filter(Boolean)
					.join(', '),
				url: clean(text(field(record, 'site') ?? '""'))
			});
		}
	});

	if (companies.length === 0) {
		throw new Error('renewal: the portfolio data lists no companies');
	}

	return companies;
}
