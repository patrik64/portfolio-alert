import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.sanofiventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// drupal: the portfolio page is a grid of logos, the whole of it in the
// page, a logo a company opening a panel kept beside it with its name,
// whether it is private, public or acquired, where it is, its site and a
// few lines about it. each logo is classed for the page's filter by what
// the company does ("Biotherapeutic", "Digital Health") and whether the
// fund has seen it list or sell ("IPO / Acquired"), which the filter names.
// what the company does is kept as a tag; one the fund has seen list or
// sell gets the Exited tag, with IPO for a listing and Acquired for a sale
// as its panel says. the legal form is not part of a name. the places are
// written too loosely to keep (street addresses, two cities at once).

const ITEM = /(?=<div class="category-[^"]*\bviews-row\b[^"]*\bportfolio-item\b)/;
const CLASSES = /^<div class="([^"]*)"/;
const NAME = /data-title="([^"]*)"/;
const KIND = /field--name-field-company-type[^>]*>([^<]*)</;
const SITE = /field--name-field-company-website">\s*<a href="([^"]*)"/;
const FILTER = /<a href="(category-\d+)" class="category-filter\b[^"]*">([^<]*)<\/a>/g;
const FORM = /,?\s+(?:inc|llc|ltd|corp)\.?$/i;
// the filter's group of companies the fund has seen list or sell
const REALISED = /^ipo\s*\/\s*acquired$/i;
const PUBLIC = /^public$/i;
const ACQUIRED = /^acquired$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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
	// the filter's labels, by the class each logo is shown under
	const labels = new Map([...html.matchAll(FILTER)].map(([, cls, label]) => [cls, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const item of html.split(ITEM).slice(1)) {
		const written = clean(item.match(NAME)?.[1] ?? '');
		const name = written.replace(FORM, '').trim() || written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const shown = (item.match(CLASSES)?.[1] ?? '').split(/\s+/).map((cls) => labels.get(cls) ?? '');
		const kind = clean(item.match(KIND)?.[1] ?? '');
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				...shown.filter((label) => !REALISED.test(label)),
				PUBLIC.test(kind) ? 'IPO' : '',
				ACQUIRED.test(kind) ? 'Acquired' : '',
				ACQUIRED.test(kind) || shown.some((label) => REALISED.test(label)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('sanofiventures: no companies in the portfolio grid — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("sanofiventures: no panel links its company's site — the panels' markup moved");
	}

	return companies;
}
