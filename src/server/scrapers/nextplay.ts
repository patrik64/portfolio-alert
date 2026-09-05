import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.nextplayventures.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace. the portfolio is two galleries of logos under their own
// headings — Exited and Active — and every logo is linked to the company, so
// the page's own words say which state a company is in. the heading is read
// rather than the section it sits in, because only the first of the two
// sections is named in the markup; walking the page in order and keeping the
// last heading seen holds for both.
//
// the name is the alt text, which the fund fills in for all but three logos.
// it writes the fund's own name into most of them for search engines — "Brex -
// Next Play Ventures", "Figma – Next Play Ventures Investments – Next Play
// venture capital – Venture Capital coaching" — and notes a sale in two more,
// so the tail is cut at either. what is left is what the fund typed: Browser
// Company keeps the fund's spelling of it rather than the company's own.
//
// the three logos it left unnamed carry the file the logo was exported from,
// Slide54.png and its neighbours, which says nothing about the company. those
// three are named by their address instead, which is exact for neurahealth,
// misses the capital in TestGorilla and reads windmillair.com as one word
// where the company is Windmill. a name from an address is at least a steady
// one, and that matters more here: a name that moved would read as the old
// company leaving and a new one arriving.
//
// one logo in the active gallery is linked to nothing, so it keeps its name
// and has no address.

// headings and logos in the order the page puts them in
const TOKEN = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>|<figure class="gallery-grid-item[\s\S]*?<\/figure>/g;
// squarespace prints alt twice, and the browser reads the first
const ALT = /\balt="([^"]*)"/;
// the fund breaks the anchor over several lines
const SITE = /<a\b[^>]*?\bhref="\s*(https?:\/\/[^"\s]+)/;
// what the fund exported a logo from, left in place of a name
const FILE = /\.(?:png|jpe?g|webp|gif|svg)$/i;
// the state a company is in unless the page says otherwise
const DEFAULT_STATE = /^(?:active|companies)$/i;
// what a company puts in front of its brand to get a free address
const DECORATION = /^(?:hello|hey|with|get|try|use|join|my|the)(?=[a-z]{3,})/;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const titled = (s: string) =>
	s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;

const fromAlt = (alt: string) =>
	clean(alt)
		.replace(/\s*[-–—]?\s*\bacquired by\b[\s\S]*$/i, '')
		.replace(/\s*[-–—|]\s*next play\b[\s\S]*$/i, '')
		.trim();

const fromHost = (url: string) => {
	try {
		const host = new URL(url).hostname.replace(/^www\./, '');
		return titled((host.split('.')[0] ?? '').replace(DECORATION, ''));
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const body = html.slice(html.indexOf('<body'));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let heading = '';
	for (const match of body.matchAll(TOKEN)) {
		if (match[1] !== undefined) {
			heading = clean(match[1]) || heading;
			continue;
		}

		const figure = match[0];
		const url = figure.match(SITE)?.[1] ?? '';
		const alt = fromAlt(figure.match(ALT)?.[1] ?? '');
		const name = alt && !FILE.test(alt) ? alt : fromHost(url);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: DEFAULT_STATE.test(heading) ? '' : heading,
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('nextplay: no companies in the portfolio galleries');
	}

	return companies;
}
