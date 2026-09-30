import type { ScrapedCompany } from './types';

const BASE_URL = 'https://b.capital';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio page is a wall of cards,
// each a logo, a region, a line and a status, opening a panel the page's
// script fills from a list it carries as data ("orig_data") — the same
// companies, with the name, the industry ("Technology & AI", "Healthcare",
// "Opportunistic") and region ("North America", "Asia") the filters read,
// whether the fund is out ("Exited"), and the panel's button: the
// company's site for most, and for the rest the fund's "Why we invested"
// piece on it, which is kept as the link when there is no site.

const DATA = /\bvar\s+orig_data\s*=\s*/;
const STEALTH = /^stealth\b/i;

interface Item {
	title?: string;
	statemodifier?: string;
	tagstate?: string;
	tagplace?: string;
	industry?: string;
	link_href?: string;
	permalink?: string;
}

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

// the list the page's script holds: the json array that follows its name
function items(html: string): Item[] {
	const at = html.search(DATA);
	if (at < 0) return [];
	const start = html.indexOf('[', at);
	let depth = 0;
	let inString = false;
	for (let i = start; i < html.length; i++) {
		const c = html[i];
		if (inString) {
			if (c === '\\') i++;
			else if (c === '"') inString = false;
		} else if (c === '"') inString = true;
		else if (c === '[') depth++;
		else if (c === ']' && --depth === 0) return JSON.parse(html.slice(start, i + 1)) as Item[];
	}
	return [];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items(html)) {
		const name = clean(item.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const link = (item.link_href ?? '').trim();
		const page = item.permalink ? `${BASE_URL}${item.permalink}` : PAGE_URL;
		const exited = /^exited$/i.test(item.statemodifier ?? '') || /^exited$/i.test(clean(item.tagstate ?? ''));
		companies.push({
			name,
			category: [tag(item.industry ?? ''), tag(item.tagplace ?? ''), exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(link) ? link : page
		});
	}
	if (companies.length === 0) {
		throw new Error('bcapital: no companies in the portfolio data');
	}

	return companies;
}
