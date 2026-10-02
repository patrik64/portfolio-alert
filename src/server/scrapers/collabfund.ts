import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://collabfund.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// jekyll: the portfolio page is written out whole, in two views the
// filter above it switches between: "Featured", shown first, a heading for
// each sector and under it the companies, each a name linked to its site
// and a pill naming the sector, kept as a tag; and "All", every company the
// fund has backed, by name and link alone. both are read, a company in both
// keeping the featured view's sector. a company the fund is out of says so
// in its name, "Tagomi (acquired by Coinbase)", and links to its buyer; the
// note is taken off the name and kept as the outcome.

const ITEM = /(?=<div\b[^>]*\bclass="grid-item\b)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
// the sector's pill, spelled out
const SECTOR = /<span\b[^>]*\bsector-label--full\b[^>]*>([\s\S]*?)<\/span>/;
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const written = clean(item.match(NAME)?.[1] ?? '');
		const note = written.match(NOTE)?.[1] ?? '';
		const name = written.replace(NOTE, '').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(item.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				tag(item.match(SECTOR)?.[1] ?? ''),
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
