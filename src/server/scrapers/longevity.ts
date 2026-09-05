import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://longevity.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, but with no cms behind it: the portfolio is a wall of logos placed
// by hand, their image files named by framer's own hashes and every one of
// their layers left with the same name the first was given ("ALX black"). so
// nothing on the page names a company but the address it links to, and the
// hostname is what names it here.
//
// the only other links out belong to the fund's next fund rather than to a
// company, and they are told apart by carrying no logo.

const ANCHOR = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

const capitalize = (s: string) => (/^[a-z]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, body] of html.matchAll(ANCHOR)) {
		if (url.includes('longevity.vc') || !body.includes('framerusercontent.com/images')) continue;
		const name = capitalize(hostLabel(url));
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('longevity: no companies on the portfolio page');
	}

	return companies;
}
