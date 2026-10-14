import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://investinor.no/en/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of cards, the whole of it in the
// page, a card a holding with its name, a line about it, a logo linking its
// site and, for the page's filters, its sector ("Technology", "Health"),
// its county ("Oslo", "Trøndelag") and the part of the portfolio it is in —
// the companies held, the funds the state fund has put money in, and the
// holdings it has sold. the funds are funds and not companies, and are
// left out. the sector and the county are kept as tags, a sale with the
// Exited tag.

const CARD = /<article class="cell portfolio-card mix[^"]*"([^>]*)>([\s\S]*?)<\/article>/g;
const DATA = (name: string) => new RegExp(`\\bdata-${name}="([^"]*)"`);
const NAME = /<h2>([\s\S]*?)<\/h2>/;
const SITE = /<a class="wrapper-link" href="([^"]*)"/;
// a filter's label, by the class it shows: <input type="checkbox" value=".oslo-en"/> … Oslo </label>
const LABEL = /<input type="checkbox" value="\.([^"]+)"\s*\/?>\s*<span class="custom-checkmark"><\/span>\s*([^<]*?)\s*<\/label>/g;
const HELD = 'selskapsportefolje-en';
const SOLD = 'avhendet-portefolje-en';
const UNSAID = /^(?:-|other|others|other sectors|all|n\/a)$/i;
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
	const labels = new Map([...html.matchAll(LABEL)].map(([, key, label]) => [key, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attributes, card] of html.matchAll(CARD)) {
		const data = (name: string) => clean(attributes.match(DATA(name))?.[1] ?? '');
		const part = data('investment');
		// the funds the fund has backed are not companies
		if (part !== HELD && part !== SOLD) continue;
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const label = (key: string) => (key ? (labels.get(key) ?? '') : '');
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [label(data('industry')), label(data('geography')), part === SOLD ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('investinor: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
