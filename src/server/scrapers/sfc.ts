import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://portal.sfccapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the investors' portal: the portfolio is a grid of cards, the whole of it
// in the page, a card a company with its name linking its site, a line
// about it and, for one the fund has sold out of, a badge — "Full Exit" or
// "Partial Exit". each card carries the ids of its sectors, which the
// filters above the grid name ("B2B Software", "Green", "Hardware &
// Robotics"), and of the exited filter, which the badge says better. the
// sectors are kept as tags, a full exit with the Exited tag and a partial
// one as written; a buyer the page writes into a name — "Surgery Hero
// (acquired by Sword Health)" — comes out of the name into "Acquired by
// …", so the name holds when the note goes.

const CARD = /(?=<div class="blcols oportfolio-cols element-item\b)/;
const CATEGORIES = /data-category="([^"]*)"/;
// a filter: the id of a sector and its name
const FILTER = /data-filter="\.(\w+)"[^>]*\/>\s*<span>([\s\S]*?)<\/span>/g;
// the exited filter's id, which the badge says better
const EXITED_FILTER = 'exited_startups';
const NAME = /<h5>\s*<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
const BADGE = /class="portfolio-exit-badge__label">([\s\S]*?)<\/span>/;
const NOTED_BUYER = /\s*\(\s*acquired by\s+([^)]+)\)\s*$/i;
const FULL_EXIT = /^full exit$/i;
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
	const sectors = new Map([...html.matchAll(FILTER)].map(([, id, label]) => [id, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const [, href = '', written = ''] = card.match(NAME) ?? [];
		const listed = clean(written);
		const buyer = listed.match(NOTED_BUYER)?.[1];
		const name = listed.replace(NOTED_BUYER, '').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const badge = clean(card.match(BADGE)?.[1] ?? '');
		const site = unescape(href).trim();
		companies.push({
			name,
			category: [
				...(card.match(CATEGORIES)?.[1] ?? '')
					.split(/\s+/)
					.map((id) => (id === EXITED_FILTER ? '' : (sectors.get(id) ?? ''))),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				badge && !FULL_EXIT.test(badge) ? tag(badge) : '',
				FULL_EXIT.test(badge) || buyer ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('sfc: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
