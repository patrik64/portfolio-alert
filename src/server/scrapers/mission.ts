import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://missionfund.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// like wndr, a client-rendered vite app: the served html is an empty shell,
// and the portfolio is a marquee of logos baked into the javascript bundle as
// one array of {src, alt, url, scale} entries, the alt naming the company and
// the url its site. the bundle's filename carries a build hash, so it is read
// from the shell on every scrape. the page shows no sectors or exits, so the
// category is empty.

const BUNDLE = /<script[^>]*type="module"[^>]*src="([^"]+\.js)"/;
// the strings as written in javascript, read with JSON.parse so an escaped
// letter ("é") comes out as itself
const LOGO = /\{src:[\w$]+,alt:("(?:[^"\\]|\\.)*"),url:("(?:[^"\\]|\\.)*")/g;
const STEALTH = /^stealth\b/i;

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!shell.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${shell.status}`);
	}
	const bundlePath = (await shell.text()).match(BUNDLE)?.[1];
	if (!bundlePath) {
		throw new Error('mission: no module bundle in the page shell');
	}

	const bundleUrl = new URL(bundlePath, PAGE_URL).href;
	const resp = await fetch(bundleUrl, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${bundleUrl}: ${resp.status}`);
	}
	const js = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, alt, url] of js.matchAll(LOGO)) {
		const name = (JSON.parse(alt) as string).replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: (JSON.parse(url) as string).trim() || PAGE_URL });
	}

	if (companies.length === 0) {
		throw new Error('mission: no portfolio logos in the bundle — the app was rebuilt');
	}

	return companies;
}
