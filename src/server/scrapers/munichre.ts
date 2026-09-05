import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.munichre.com/mrv/en/portfolio.html';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// adobe experience manager. the page looks like a search — it has a filter bar
// and a Load next results button — but the portfolio itself is not behind it:
// it is two tabs written into the page, one of companies the fund holds and
// one of the ones it has left, each a wall of logos linked to the companies.
//
// a logo carries the fund's own label for it twice, as the image's title and
// as its alt, and where the two differ the title is the tidier of them: it
// says Air Doctor and ShipIn where the alt says "Air Doctor logo" and "ShipIn
// Logo". so the title is read and the alt is what fills in for it.
//
// the labels are taken as typed, lower case and all: the fund writes abstract,
// acko and mechanical orchard that way itself, and these are attributes rather
// than anything a stylesheet has had its way with.
//
// one label is simply wrong — the logo for Relayr is labelled acko, which is
// another company in the same portfolio — so a label that repeats one already
// used is dropped in favour of the file the logo was uploaded under, which
// here says Relayr and agrees with the address. without that the fund would
// come back one company short and nothing would say which.

const PANEL = /<div class="accordion__panel">([\s\S]*?)(?=<div class="accordion__panel">|$)/g;
const TITLE = /accordion__titleLink[^>]*">\s*<a[^>]*>([\s\S]*?)<\/a>/;
const LOGO = /<a class="imageBasic__link[^"]*" href="([^"]*)"[^>]*>\s*<img\b([^>]*)>/g;
const attribute = (name: string) => new RegExp(`\\b${name}="([^"]*)"`);
// the state a company is in unless the fund says otherwise
const DEFAULT_STATE = /^portfolio companies?$/i;
// what a label or a file says about the picture rather than the company
const PICTURE = /[\s_-]*logos?$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the file a logo was uploaded under, read as a name
const fromFile = (src: string) =>
	clean(
		decodeURIComponent(src.split('/').pop() ?? '')
			.replace(/\.[a-z0-9]+$/i, '')
			.replace(PICTURE, '')
			.replace(/[-_]+/g, ' ')
	);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, panel] of html.matchAll(PANEL)) {
		const state = clean(panel.match(TITLE)?.[1] ?? '');

		for (const [, url, image] of panel.matchAll(LOGO)) {
			const labelled = clean(
				image.match(attribute('title'))?.[1] || image.match(attribute('alt'))?.[1] || ''
			).replace(PICTURE, '');
			// a label the fund has already used says nothing about this company
			const name =
				labelled && !seen.has(labelled.toLowerCase())
					? labelled
					: fromFile(image.match(attribute('src'))?.[1] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			companies.push({
				name,
				category: DEFAULT_STATE.test(state) ? '' : state,
				url
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('munichre: no companies in the portfolio tabs');
	}

	return companies;
}
