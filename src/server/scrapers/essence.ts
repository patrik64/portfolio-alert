import type { ScrapedCompany } from './types';

const BASE_URL = 'https://essencevc.fund';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a vite app on vercel: the page is an empty shell that one script renders,
// and the portfolio travels inside that script as a list of objects — an
// id, the name in capitals as the page shows it, a category ("Developer
// Infra") and the company's site. the script's name is hashed per build, so
// it is read off the shell each run. nothing marks an exit.

const SCRIPT = /<script\b[^>]*\bsrc="([^"]*\/assets\/index-[^"]+\.js)"/;
// {id:`01`,name:`MODAL`,category:`AI Infra`,url:`https://modal.com`} — the
// strings in backticks or quotes, as the build leaves them
const ENTRY =
	/\{id:\s*[`"']\d+[`"'],\s*name:\s*[`"']([^`"']*)[`"'],\s*category:\s*[`"']([^`"']*)[`"'],\s*url:\s*[`"']([^`"']*)[`"']\s*\}/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(`${BASE_URL}/`);
	const script = shell.match(SCRIPT)?.[1];
	if (!script) {
		throw new Error('essence: the page names no script to read the portfolio from');
	}
	const bundle = await fetchText(new URL(unescape(script), BASE_URL).href);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, rawName, category, url] of bundle.matchAll(ENTRY)) {
		const name = clean(rawName);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: tag(category), url: clean(url) });
	}

	if (companies.length === 0) {
		throw new Error('essence: no portfolio in the script');
	}

	return companies;
}
