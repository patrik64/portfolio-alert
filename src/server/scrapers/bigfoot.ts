import type { ScrapedCompany } from './types';

const BASE_URL = 'https://bigfootcap.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a vite app: the page is an empty shell that one script renders, and the
// portfolio travels inside that script as a list of objects. the fund is
// a lender, so a company is a borrower — its name, the facility it took
// ("Senior Growth Facility"), where it is, the year, its site, whether the
// loan is "current" or "past" and, for a past one, how it ended:
// "Strategic Acquisition (2022)", "Bank Lender Refinance (2024)". a past
// loan is the fund's exit from the company, and is marked so with the
// outcome kept. the script's name is hashed per build, so it is read off
// the shell each run.

const SCRIPT = /<script\b[^>]*\bsrc="([^"]*\/assets\/index-[^"]+\.js)"/;
// {name:"Altvia",product:"Junior Growth Facility",location:"Denver, CO",invested:2018,outcome:"PE Acquisition (2020)",url:"http://altvia.com",status:"past",image:"…"}
const ENTRY = /\{name:"(?:[^"\\]|\\.)*",product:"[^{}]*?\}/g;
const FIELD = (key: string) => new RegExp(`\\b${key}:"((?:[^"\\\\]|\\\\.)*)"`);
const YEAR = /\binvested:((?:19|20)\d{2})\b/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

// a string as the bundle writes it, its escapes undone
const literal = (s: string) => unescape(s.replace(/\\(["'\\/])/g, '$1')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => literal(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(PAGE_URL);
	const script = shell.match(SCRIPT)?.[1];
	if (!script) {
		throw new Error('bigfoot: the page names no script to read the portfolio from');
	}
	const bundle = await fetchText(new URL(unescape(script), BASE_URL).href);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [entry] of bundle.matchAll(ENTRY)) {
		const name = literal(entry.match(FIELD('name'))?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = literal(entry.match(FIELD('url'))?.[1] ?? '');
		const year = entry.match(YEAR)?.[1];
		const past = /^past$/i.test(literal(entry.match(FIELD('status'))?.[1] ?? ''));
		companies.push({
			name,
			category: [
				tag(entry.match(FIELD('product'))?.[1] ?? ''),
				year ? `Invested ${year}` : '',
				tag(entry.match(FIELD('outcome'))?.[1] ?? ''),
				past ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bigfoot: no portfolio in the script');
	}

	return companies;
}
