import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://2050.do/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of cards, the whole of it in the
// page, a card a company — or one of the commons the fund backs, a
// research centre or a film — with its name, the fund's theme it answers
// ("Live & Produce Sustainably") and whether it is one of the fund's
// ventures, its commons or an exit, a few lines about it and a link to its
// site, the card itself linking either the site or the fund's article on
// it. the theme and the kind are kept as tags, an exit with the Exited tag.
// the page's filter counts each kind, and a grid holding fewer cards than
// the counts add up to fails the run rather than pass for the whole.

const CARD = /(?=<div class="card-outer")/;
const NAME = /<h3>([\s\S]*?)<\/h3>/;
const LABEL = /class="filter-button card-category"[^>]*>([^<]*)</g;
const ARROW = /<a href="([^"]*)" class="right-arrow"/;
const CONTENT = /<a href="([^"]*)" class="content"/;
const COUNT = /class="filter-button type secondary-filter"[^>]*\bcat-count="(\d+)"/g;
const EXIT = /^exits?$/i;
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

const offsite = (href: string) => /^https?:\/\//i.test(href) && !/^https?:\/\/(?:www\.)?2050\.do\b/i.test(href);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const cards = html.split(CARD).slice(1);
	const counted = [...html.matchAll(COUNT)].reduce((sum, [, count]) => sum + Number(count), 0);
	if (cards.length < counted) {
		throw new Error(`2050: the grid holds ${cards.length} cards of the ${counted} its filter counts`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const labels = [...card.matchAll(LABEL)].map(([, label]) => clean(label));
		// the arrow links the site; failing it, the card does when it leads off the fund's own
		const site = [card.match(ARROW)?.[1], card.match(CONTENT)?.[1]]
			.map((href) => unescape(href ?? '').trim())
			.find(offsite);
		companies.push({
			name,
			category: [
				...labels.filter((label) => !EXIT.test(label)).map(tag),
				labels.some((label) => EXIT.test(label)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('2050: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
