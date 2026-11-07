import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://techsquareventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page lists every company, a logo opening a panel
// with the name, the founder, a line about the company and its site. an item
// is classed for the page's filters by the fund that backed it
// ("early-stage-fund", "engage", or both) and "exited" for an exit, which the
// filter menu's links spell out. the funds are kept as tags, an exit with the
// Exited tag.

const ITEM = /(?=<div class="eachItem\b)/;
const CLASSES = /^<div class="eachItem\b([^"]*)"/;
const NAME = /<p class="name">([\s\S]*?)<\/p>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="morecompanies"/;
const FILTER = /<a href="#([a-z0-9-]+)">([^<]*)<\/a>/g;
const EXITED = 'exited';
const STEALTH = /^stealth\b/i;

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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const [head, ...items] = html.split(ITEM);
	const labels = new Map([...head.matchAll(FILTER)].map(([, key, label]) => [key, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const classes = (item.match(CLASSES)?.[1] ?? '').split(/\s+/).filter(Boolean);
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...classes.filter((key) => key !== EXITED).map((key) => labels.get(key) ?? ''),
				classes.includes(EXITED) ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('techsquare: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
