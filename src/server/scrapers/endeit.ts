import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.endeit.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a grid of cards, the whole of it in the
// page, a card a company with its name, its sector ("Fintech", "Energy
// Tech"), the year the fund invested, its stage ("Current" or "Exit") and
// its site. an exit's year runs from the investment to the sale, with the
// buyer after it ("2008 - 2014 (MacroMill)"). the sector and the year the
// fund came in are kept as tags, an exit with the Exited tag and its buyer.

const CARD = /(?=<div role="listitem" class="collection-item w-dyn-item">)/;
const NAME = /<div class="body-xl">([\s\S]*?)<\/div>/;
const SECTOR = /fs-list-field="Tag"[^>]*>([^<]*)</;
const FACT = (label: string) =>
	new RegExp(
		`<div class="paragraph allcaps">${label}</div><div class="paragraph allcaps gray[^"]*">([^<]*)</div>`,
		'i'
	);
const SITE = /<div class="paragraph allcaps">Website<\/div><a href="([^"]*)"/i;
// the year the fund came in leads the field: "2021", "2008 - 2014 (MacroMill)"
const INVESTED = /^\s*((?:19|20)\d{2})(?!\d)/;
const BUYER = /\(([^()]+)\)\s*$/;
const EXIT = /^exit(?:ed)?$/i;
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
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const years = clean(card.match(FACT('year'))?.[1] ?? '');
		const exited = EXIT.test(clean(card.match(FACT('stage'))?.[1] ?? ''));
		const buyer = exited ? clean(years.match(BUYER)?.[1] ?? '') : '';
		const invested = years.match(INVESTED)?.[1];
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				tag(card.match(SECTOR)?.[1] ?? ''),
				invested ? `Invested ${invested}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('endeit: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
