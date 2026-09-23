import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://industrious.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on wp engine. the portfolio page holds every company as a card:
// its logo, whose alt text names it, a label for what it does ("Launch",
// "Space Logistics"), the fund's own types for it as a data attribute — spelled
// out by the filter buttons above the grid — a line about it, a link to its
// site, and, on a dozen, a sticker for how the investment went. the rest api
// has the companies too, but not their sites.
//
// a sticker usually marks an exit ("Acquired", "IPO"), but not always: hadrian's
// "Via Datum Acquisition" says how the fund came to hold it, so only the
// stickers naming an acquisition or a listing outright add the Exited tag.

const CARD = /(?=<[a-z]+[^>]*class="(?:[^"]*\s)?customer-item(?:\s[^"]*)?")/;
const NAME = /<img[^>]*\salt="([^"]*)"/;
const LABEL = /class="customer-item-label">([\s\S]*?)<\/div>/;
const TYPES = /data-customer-type="([^"]*)"/;
const STICKER = /class="customer-sticker">([\s\S]*?)<\/div>/;
const SITE = /class="customer-item-link" href="(https?:\/\/[^"]+)"/;
const PILL = /<button class="customer-pill[^"]*" id="([^"]+)">([\s\S]*?)<\/button>/g;
const EXIT = /^(acquired|ipo)$|\(ipo\)/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?43;/g, '+')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the labels are typed by hand, some in capitals and some not ("AUTONOMY",
// "Autonomy"); the capitals are evened out, sparing a word as short as an
// initialism ("AI") but not the start of a longer one ("IN-SPACE")
const cased = (label: string) =>
	/[a-z]/.test(label)
		? label
		: label
				.split(' ')
				.map((word) =>
					word.replace(/[^A-Z]/g, '').length <= 2
						? word
						: word.replace(/[A-Z]+/g, (part) => part[0] + part.slice(1).toLowerCase())
				)
				.join(' ');

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const types = new Map([...html.matchAll(PILL)].map((m) => [m[1], clean(m[2])]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const sticker = clean(card.match(STICKER)?.[1] ?? '');
		const tags = [
			cased(clean(card.match(LABEL)?.[1] ?? '')),
			...(card.match(TYPES)?.[1] ?? '')
				.split(/\s+/)
				.filter(Boolean)
				.map((slug) => types.get(slug) ?? ''),
			sticker,
			EXIT.test(sticker) ? 'Exited' : ''
		]
			.filter(Boolean)
			.map(tag);
		companies.push({
			name,
			// a label and a type can say the same thing ("Manufacturing")
			category: tags.filter((t, i) => tags.findIndex((u) => u.toLowerCase() === t.toLowerCase()) === i).join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('industrious: no companies on the portfolio page');
	}

	return companies;
}
