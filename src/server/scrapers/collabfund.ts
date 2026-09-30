import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://collabfund.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// jekyll: the portfolio page is written out whole, a heading for each
// sector and under it the companies, each a name linked to its site and a
// pill naming the sector, which the filters above the list spell out. a
// company the fund is out of says so in its name, "Tagomi (acquired by
// Coinbase)", and links to its buyer; the note is taken off the name and
// kept as the outcome.

const ITEM = /(?=<div\b[^>]*\bclass="grid-item\b)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const CLASSES = /^<div\b[^>]*\bclass="([^"]*)"/;
// a filter: the class the companies carry, and how it is spelled out
const FILTER = /<button\b[^>]*\bdata-filter="\.([^"]+)"[^>]*>\s*<span\b[^>]*\bsector-label--full[^>]*>([\s\S]*?)<\/span>/g;
// "Tagomi (acquired by Coinbase)"
const NOTE = /\s*\((acquired by [^)]+|acquired|ipo|merged[^)]*)\)\s*$/i;
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

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const sectors = new Map([...html.matchAll(FILTER)].map(([, slug, label]) => [slug, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const written = clean(item.match(NAME)?.[1] ?? '');
		const note = written.match(NOTE)?.[1] ?? '';
		const name = written.replace(NOTE, '').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const classes = item.match(CLASSES)?.[1].split(/\s+/) ?? [];
		const site = unescape(item.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...classes.map((c) => sectors.get(c) ?? ''),
				note ? sentence(note.replace(/^ipo$/i, 'IPO')) : '',
				note ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('collabfund: no companies on the portfolio page');
	}

	return companies;
}
