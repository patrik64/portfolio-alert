import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fernbrookmgmt.com/investments/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress under beaver builder: every investment is a popup module, its
// tile a logo captioned "Fernbrook Investment: Alfred" — or "Exited", with a
// banner class, for a company the fund is out of — and its popup naming the
// company in a heading over a paragraph about it, where it is based, and its
// site. the module's classes carry the sectors the page's buttons filter by
// ("software marketplace"), spelled out by the buttons' labels; the page
// writes one of them two ways ("marketplace", "marketplaces").

const MODULE = /(?=<div class="fl-module fl-module-modal-popup\b[^"]*\bfilterDiv\b)/;
const CLASSES = /^<div class="([^"]*)"/;
const BODY = /uabb-modal-content-data[^>]*>([\s\S]*?)<\/div>/;
// the popup's headings: the first holds the logo, the next the name
const HEADINGS = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/g;
const CAPTION = /<p class="exited-banner[^"]*">([\s\S]*?)<\/p>/;
const BASED = /<p\b[^>]*>\s*Based in\s+([^<]+)</i;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const EXITED = /\bexited-banner\b(?!-none)/;
const BUTTON = /<button\b[^>]*onclick="filterSelection\('([^']+)'\)"[^>]*>([\s\S]*?)<\/button>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "New York, NY" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the sectors' labels, by the class each button filters on; the plural
	// spelling of one class points at the same label
	const labels = new Map<string, string>();
	for (const [, key, label] of html.matchAll(BUTTON)) {
		if (key !== 'all') labels.set(key, tag(label));
	}
	const labelOf = (key: string) => labels.get(key) ?? labels.get(key.replace(/s$/, '')) ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const module of html.split(MODULE).slice(1)) {
		const body = module.match(BODY)?.[1] ?? '';
		// the first heading with words in it, or the caption's name — cut short
		// by the page ("Fernbrook Investment: Maisone") — when a popup has none
		const name =
			[...body.matchAll(HEADINGS)].map((m) => clean(m[1])).find(Boolean) ||
			clean(module.match(CAPTION)?.[1] ?? '')
				.replace(/^fernbrook investment:\s*/i, '')
				.replace(/\.$/, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const classes = (module.match(CLASSES)?.[1] ?? '').split(/\s+/);
		const sectors = classes
			.filter((c) => c && !/^(fl-|uabb-|filterDiv$)/.test(c) && !c.startsWith('fl-node'))
			.map(labelOf)
			.filter(Boolean);
		const based = tag(body.match(BASED)?.[1] ?? '');
		companies.push({
			name,
			category: [...sectors, based, EXITED.test(module) ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(body.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('fernbrook: no investments on the page');
	}

	return companies;
}
