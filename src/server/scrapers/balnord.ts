import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.balnord.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, every list whole in the html: the current companies as cards, then the
// "past commitments" as a wall of logos with neither name nor address. those come
// with a popup each further down, which has both, and the same insides as a current
// card: the name in a link to the site ("#" on the few without one), the year, stage
// and country as tags, and a stamp hidden on the ones still held. an exit takes the
// place of the stage among the tags.
const CARD = /(?=<div role="listitem" class="(?:portfolios_item|past-commitments_popup) w-dyn-item")/;
const PAST = /^<div role="listitem" class="past-commitments_popup\b/;
const NAME = /class="portfolios_tags_block"><a href="([^"]*)"[^>]*><div[^>]*>([^<]*)<\/div>/;
const TAGS = /class="portfolios_tags_list">([\s\S]*?)<div class="text-size-lg is-portfolio-item/;
const TAG = /class="portfolios_tags_item"><div[^>]*>([^<]+)<\/div>/g;
const EXIT_STAMP = 'class="past-commitments_exit-wrap"';
const EXITED = /^exited$/i;

const clean = (s: string) =>
	s
		.replace(/&#x27;|&#0?39;|&apos;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const cards = (await resp.text()).split(CARD).slice(1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const [, href = '', shown = ''] = card.match(NAME) ?? [];
		const name = clean(shown);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const tags = [...(card.match(TAGS)?.[1] ?? '').matchAll(TAG)].map(([, label]) => tag(label));
		// a card's stamp comes before its tags; after the last card of a list come others'
		const stamp = card.slice(0, card.search(TAGS)).includes(EXIT_STAMP);
		companies.push({
			name,
			category: [
				...tags.filter((t) => !EXITED.test(t)),
				PAST.test(card) ? 'Past Commitment' : '',
				stamp || tags.some((t) => EXITED.test(t)) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//.test(href) ? href : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('balnord: no companies on the portfolio page');
	}

	return companies;
}
