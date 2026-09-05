import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.mayfield.com/meet-our-founders/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the wall is a hundred and thirty-five tiles and every one of them
// also has a panel further down the same page, so one request brings the names,
// what the fund files each company under, what became of it, and its address.
//
// a tile's classes are slugs, and the fund's own words for them are on the
// filter it offers — ai is AI, human-health is Human Health — so those are
// read off the page rather than tidied here. two of the classes are states
// rather than sectors: current is the state a company is in unless something
// has happened, and milestone is the other, though it never has to be written
// down because every one of the seventy-four carries a line saying what
// happened — NASDAQ: LYFT, Acq. by Google, NASDAQ: HCP, Acq. by IBM. one
// company the fund still holds has a line of its own, Partnered at Inception,
// and it is kept the same way.
//
// a panel puts the company's address beside its linkedin and its x, and the
// address is the only one of the three written out rather than drawn as an
// icon. sixty-four companies have none, nearly all of them bought long ago.

const TILE = /<div class="founders-box ([^"]*)"([\s\S]*?)<\/div>/g;
const NAME = /<p class="name">([\s\S]*?)<\/p>/;
const NOTE = /<h6[^>]*class="partnered">([\s\S]*?)<\/h6>/;
const PANEL_OF = /data-src="#([^"]*)"/;
const PANEL = /<div class="founder-grid-modal" id="([^"]*)"([\s\S]*?)(?=<div class="founder-grid-modal" id="|<\/section>)/g;
const SOCIAL = /<div class="modal-social">([\s\S]*?)<\/div>/;
const LINK = /<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
// the fund's own word for each slug it filters by
const WORD = /<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
// the state a company is in unless the fund says otherwise
const DEFAULT_STATE = /^current$/i;
// the state the fund only ever writes about in a line of its own
const HAPPENED = /^milestone$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const words = new Map<string, string>();
	for (const [, slug, said] of html.matchAll(WORD)) {
		const word = clean(said);
		if (slug && word) words.set(slug, word);
	}

	// each company's own address, from the panel behind its tile
	const addresses = new Map<string, string>();
	for (const [, panel, inside] of html.matchAll(PANEL)) {
		const social = inside.match(SOCIAL)?.[1] ?? '';
		const written = [...social.matchAll(LINK)].find((link) => clean(link[2]));
		if (written) addresses.set(panel, written[1]);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, classes, tile] of html.matchAll(TILE)) {
		const name = clean(tile.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const labels = classes.split(/\s+/).filter(Boolean);
		const note = clean(tile.match(NOTE)?.[1] ?? '');
		const state = labels.find((label) => HAPPENED.test(label));

		companies.push({
			name,
			category: [
				...labels
					.filter((label) => !DEFAULT_STATE.test(label) && !HAPPENED.test(label))
					.map((label) => words.get(label) ?? ''),
				note || (state ? words.get(state) ?? '' : '')
			]
				.filter(Boolean)
				.join(', '),
			url: addresses.get(tile.match(PANEL_OF)?.[1] ?? '') ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('mayfield: no companies among the founders');
	}

	return companies;
}
