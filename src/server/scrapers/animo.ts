import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://animo.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the home page's portfolio is a grid of
// logos, each opening a panel the page's script fills from data served
// with the page, keyed by the logo's id: the company's name, its site and
// its stage ("Pre-Seed", "Seed"), and the programme it sits in, "Core" or
// "Discovery" as the grid's filter calls them; the stage and programme
// are kept as tags. the ones named only "Unannounced" are left out, and a
// logo with no data behind it fails the run, its name being nowhere else.
// nothing marks an exit.

const DATA = 'window.portfolioData = ';
const GRID_ITEM = /<div\b[^>]*\bclass="item"[^>]*\bdata-id="(\d+)"/g;
const FILTER = /\bdata-filter="\.([\w-]+)"[^>]*>([\s\S]*?)</g;
const UNNAMED = /^(?:stealth|unannounced)\b/i;

interface Entry {
	title?: string;
	category_slug?: string;
	buttons?: { link?: string };
	tags?: { name?: string }[];
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the json object that opens at start, up to its closing brace
function objectAt(text: string, start: number): string {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '{') depth++;
			else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const at = html.indexOf(DATA);
	const json = at < 0 ? '' : objectAt(html, at + DATA.length);
	if (!json) {
		throw new Error('animo: no portfolio data served with the page');
	}
	const data = JSON.parse(json) as { [id: string]: Entry };
	const programmes = new Map([...html.matchAll(FILTER)].map(([, slug, label]) => [slug, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, id] of html.matchAll(GRID_ITEM)) {
		const entry = data[id];
		if (!entry) {
			throw new Error(`animo: the logo ${id} has no data behind it`);
		}
		const name = clean(entry.title ?? '');
		if (!name || UNNAMED.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const slug = entry.category_slug ?? '';
		const site = (entry.buttons?.link ?? '').trim();
		companies.push({
			name,
			category: [programmes.get(slug) ?? tag(slug.replace(/^\w/, (c) => c.toUpperCase())), ...(entry.tags ?? []).map((t) => tag(t.name ?? ''))]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('animo: no companies in the portfolio grid');
	}

	return companies;
}
