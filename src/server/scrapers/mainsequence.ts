import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.mseq.vc';
const PAGE_URL = `${BASE_URL}/all-companies`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// webflow. the portfolio is a set of tabs, one for each of the six challenges
// the fund sets itself and one holding all of them, and a company sits under
// as many challenges as it answers. the challenges are named on the tabs
// themselves, which is where the wording comes from — the fund's menu calls
// two of them something else, and the tabs' own ids carry a misspelling, so
// neither of those is used.
//
// the page lays every tab out twice over, once for a wide screen and once for
// a narrow one, and the narrow set has gone stale: its space tab holds the
// industry tab's companies, which would file fifteen companies under a
// challenge they are not in and leave three under none. so the wide set is
// read, and a company left with no challenge at all stops the scrape, since
// that is what reading the stale set looks like.
//
// the tab that holds every company is the fund's see-all rather than a
// challenge, so it names the portfolio without naming a category.
//
// a card gives the company and the fund's own page for it; the address is on
// that page, under the button out to it.

const PANE = /<div[^>]*\bdata-w-tab="([^"]*)"[^>]*\bclass="([^"]*w-tab-pane[^"]*)"/g;
const TAB = /<a[^>]*\bclass="[^"]*w-tab-link[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const TAB_OF = /\bdata-w-tab="([^"]*)"/;
const CARD = /(?=<div[^>]*\brole="listitem")/;
const SLUG = /href="\/msv-company-page\/([^"]+)"/;
const NAME = /class="(?:company-name|names)"[^>]*>([^<]*)</;
const SITE = /<a[^>]*?\bhref="([^"]*)"[^>]*class="website-button/;
// the copy of the tabs laid out for a narrow screen
const NARROW = /mobile/i;
// an icon the fund sets in a tab's own words
const GLYPH = /[-]/g;

const clean = (s: string) =>
	s
		.replace(GLYPH, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	// what the fund calls each tab, against the id the tab is held by
	const said = new Map<string, string>();
	for (const tab of html.matchAll(TAB)) {
		const id = tab[0].match(TAB_OF)?.[1];
		const label = clean(tab[1]);
		if (id && label && !said.has(id)) said.set(id, label);
	}

	const marks = [...html.matchAll(PANE)];
	const panes: { label: string; slugs: Set<string> }[] = [];
	const names = new Map<string, string>();

	for (const [at, mark] of marks.entries()) {
		if (NARROW.test(mark[2])) continue;
		const pane = html.slice(mark.index, marks[at + 1]?.index);

		const slugs = new Set<string>();
		for (const card of pane.split(CARD).slice(1)) {
			const slug = card.match(SLUG)?.[1];
			if (!slug) continue;
			slugs.add(slug);
			const name = clean(card.match(NAME)?.[1] ?? '');
			if (name && !names.has(slug)) names.set(slug, name);
		}
		if (slugs.size > 0) panes.push({ label: said.get(mark[1]) ?? clean(mark[1]), slugs });
	}

	if (names.size === 0) {
		throw new Error('mainsequence: no companies under the portfolio tabs');
	}

	// the tab holding the whole portfolio is the see-all, not a challenge
	const challenges = panes.filter((pane) => pane.slugs.size < names.size);
	const under = (slug: string) =>
		challenges.filter((pane) => pane.slugs.has(slug)).map((pane) => pane.label);

	const unfiled = [...names.keys()].filter((slug) => under(slug).length === 0);
	if (unfiled.length > 0) {
		throw new Error(`mainsequence: no challenge holds ${unfiled.join(', ')}`);
	}

	const companies: ScrapedCompany[] = [];
	const slugs = [...names.keys()];
	for (let at = 0; at < slugs.length; at += BATCH_SIZE) {
		const batch = slugs.slice(at, at + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((slug) => fetchText(`${BASE_URL}/msv-company-page/${slug}`))
		);
		batch.forEach((slug, index) => {
			const url = pages[index].match(SITE)?.[1] ?? '';
			companies.push({
				name: names.get(slug) ?? '',
				category: under(slug).join(', '),
				url: /^https?:\/\//i.test(url) ? url : ''
			});
		});
	}

	return companies;
}
