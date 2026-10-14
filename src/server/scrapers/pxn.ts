import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.pxnventures.co.uk/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio is a grid of logos, the whole of it in the page,
// a logo a company opening a panel kept beside the grid, which names the
// company and gives, each by its icon, where it is based ("Manchester",
// "North East"), its sector ("FinTech", "DeepTech") and now and then the
// year it was founded, with a line about it. the place, the sector and the
// year are kept as tags. the panels link no company's site and mark no
// exits, so a company links the portfolio.

const PANEL = /(?=<div class="pv-portfolio-overlay__content--data js-overlay-item-data\b)/;
const NAME = /<h1\b[^>]*>([\s\S]*?)<\/h1>/;
// a fact: its icon, then its value up to the next icon or the description
const FACT = /class="material-icons text-muted">([a-z_]+)<\/span>([\s\S]*?)(?=<span class="material-icons|<div class="pv-portfolio-overlay__content--data__desc)/g;
const PLACE = 'fmd_good';
const SECTOR = 'business';
const FOUNDED = 'verified';
const YEAR = /\b(?:19|20)\d{2}\b/;
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const panel of html.split(PANEL).slice(1)) {
		const name = clean(panel.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const facts = new Map<string, string>();
		for (const [, icon, value] of panel.matchAll(FACT)) {
			if (!facts.has(icon)) facts.set(icon, clean(value));
		}
		const founded = facts.get(FOUNDED)?.match(YEAR)?.[0];
		companies.push({
			name,
			category: [tag(facts.get(PLACE) ?? ''), tag(facts.get(SECTOR) ?? ''), founded ? `Founded ${founded}` : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('pxn: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
