import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://founderfuel.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: every company of the accelerator is a card
// in one list, naming it in a link to its site, and carrying what the page's
// filters sort by as data attributes — its status ("active", "acquired",
// "shutdown"), its stage, the cohort it went through ("2012-spring") and its
// sectors — which the filter buttons spell out. an acquired company is an
// exit, its buyer kept when the card names one ("Acquired by Unity
// Technologies, March 2014"), as is one whose stage says "M&A" or "Public";
// a company shut down folded rather than exited, and keeps the word only.

const CARD = /(?=<[a-z]+\b[^>]*class="[^"]*\bfiltered-list__grid-item\b)/;
const OPENING = /^<[^>]+>/;
const BUTTON = /<button\b[^>]*\bdata-filter-name="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const HREF = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const LINE = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
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

const attr = (element: string, name: string) =>
	element.match(new RegExp(`\\bdata-filtered-list-filter-${name}="([^"]*)"`))?.[1]?.trim() ?? '';

// "food-and-beverage-tech" -> "Food And Beverage Tech", for a filter with no button
const titled = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// each filter's slug and its label; the "View all" buttons hold several
	const labels = new Map<string, string>();
	for (const [, slug, label] of html.matchAll(BUTTON)) {
		const key = slug.trim();
		if (key && !/\s/.test(key)) labels.set(key, tag(label));
	}
	const label = (slug: string) => labels.get(slug) ?? titled(slug);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const heading = card.match(NAME)?.[1] ?? '';
		const name = clean(heading);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const opening = card.match(OPENING)?.[0] ?? '';
		const status = attr(opening, 'one');
		const stage = attr(opening, 'two');
		const cohort = attr(opening, 'three');
		const sectors = attr(opening, 'four').split(/\s+/).filter(Boolean);
		// "Acquired by Unity Technologies, March 2014" -> the buyer, not the month
		const said = [...card.matchAll(LINE)].map((m) => clean(m[1])).at(-1) ?? '';
		const sold = /^acquired by\b/i.test(said) ? tag(said.split(',')[0]) : '';
		const exited = status === 'acquired' || stage === 'ma' || stage === 'public';
		companies.push({
			name,
			category: [
				...sectors.map(label),
				stage && stage !== 'ma' ? label(stage) : '',
				cohort ? `Cohort ${label(cohort)}` : '',
				status === 'shutdown' ? label(status) : '',
				sold,
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(heading.match(HREF)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('founderfuel: no companies on the companies page');
	}

	return companies;
}
