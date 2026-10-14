import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.cuspcapital.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is a grid of cards, the whole portfolio in the
// page, a card a company with its logo linking its site, where it is based
// ("Paris, France"), the year it was founded, the year the fund invested,
// a few lines about it and, for one the fund is out of, an "Exit" badge.
// the name is the logo's alt text where the logo has one ("Logo von
// Fixably"); otherwise the lines name the company, in their second sentence
// as often as their first ("…at scale. 2501.AI enables…"), and the name is
// the words there that spell the site's name. a card that names its
// company nowhere is left out. the places ("Mountain View, USA & Heidelberg,
// Germany") and the years are kept as tags, an exit with the Exited tag.

const ITEM = /(?=<div\b[^>]*role="listitem" class="portfolio_item w-dyn-item")/;
const LOGO = /<img\b[^>]*\balt="([^"]*)"[^>]*class="portfolio_image"/;
const SITE = /<a\b[^>]*href="([^"]*)"[^>]*class="portfolio_image-link\b/;
const PLACE = /class="portfolio_content-left">\s*<div\b[^>]*>([\s\S]*?)<\/div>/;
const FACT = (label: string) =>
	new RegExp(`>${label}:</div>\\s*<div class="text-weight-semibold[^"]*">\\s*((?:19|20)\\d{2})`);
const LINES = /class="portfolio_content-left">[\s\S]*?<\/div><\/div><\/div>\s*<div class="text-size-small">([\s\S]*?)<\/div>/;
// the badge, hidden on a company the fund still holds
const EXIT = /class="portfolio_exit-button"/;
// "Logo von Fixably", "Portfolio Logo von Sides", "taclia logo"
const LOGO_WORDS = /^(?:portfolio\s+)?logo\s+(?:von|of)\s+|\s+logo$/gi;
// a word as a name may be written: "2501.AI", "ONE WARE"
const WORD = /[\p{L}\p{N}][\p{L}\p{N}.&'’+-]*/gu;
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

const spelled = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// a phrase without the possessive it ends on: "Healthcare’s" -> "Healthcare"
const bare = (s: string) => s.replace(/[.,;:]+$/, '').replace(/['’]s?$/, '');

// the earliest words in the lines that spell the site's name: whole, with its
// domain ("2501.AI" for 2501.ai), by its parts ("Delta Labs" for delta-labs)
// or as its ending ("acto" for heyacto, "Livo" for getlivo)
function namedIn(lines: string, site: string): string {
	const domain = site.replace(/^https?:\/\/(?:www\.)?/i, '').split(/[/?#]/)[0];
	const host = domain.split('.')[0];
	const words = lines.match(WORD) ?? [];
	const phrases = words.flatMap((_, i) =>
		[4, 3, 2, 1].filter((n) => i + n <= words.length).map((n) => bare(words.slice(i, i + n).join(' ')))
	);
	const fits: ((key: string) => boolean)[] = [
		(key) => key === spelled(host) || key === spelled(domain),
		(key) => host.split('-').some((part) => part.length >= 4 && key === spelled(part)),
		(key) => key.length >= 4 && spelled(host).endsWith(key)
	];
	for (const fit of fits) {
		const phrase = phrases.find((p) => fit(spelled(p)));
		if (phrase) return phrase;
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		const alt = clean(item.match(LOGO)?.[1] ?? '').replace(LOGO_WORDS, '').trim();
		const name = alt || namedIn(clean(item.match(LINES)?.[1] ?? ''), site);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const founded = item.match(FACT('Founded'))?.[1];
		const invested = item.match(FACT('Invested'))?.[1];
		const exited = EXIT.test(item);
		companies.push({
			name,
			category: [
				...clean(item.match(PLACE)?.[1] ?? '').split(/[,&]/).map(tag),
				founded ? `Founded ${founded}` : '',
				invested ? `Invested ${invested}` : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('cusp: no companies on the companies page — the markup moved');
	}

	return companies;
}
