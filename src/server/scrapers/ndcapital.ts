import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://nd.capital/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, but the portfolio is a grid of logos written by hand into the
// page rather than a post type — the site's own api knows nothing about it,
// and the media library holds the logos under their file names with no title
// and no alt text. so a company here has no name written down anywhere: only
// a logo, a link, and which of the two sciences the fund files it under.
//
// the grid is laid out twice, once for a wide screen and once for a narrow
// one. only the wide one carries the science, so it is the one read.
//
// the address therefore names the company, as for p1 and vu venture partners,
// and the logo file may respell it where the two spell the same letters —
// whichever of them puts the name in more words wins, so crocus-technology.com
// stays Crocus Technology while arc-therapeutics-front.png makes Arc
// Therapeutics out of arctherapeutics.bio. where the two disagree the address
// is believed: the files also hold a typo (visby-mediacal), a colour
// (Manus_greyed_transparent) and a shape (h55-icon), and the links are right
// every time.
//
// an upper-case file is trusted here, unlike p1, because on this site it is
// how the brand is written and not how the logo was exported — AIRNA, SYNDEX
// and OPNOVIX all print that way in their own wordmarks.
//
// one link points at a press release rather than at a company: the fund marks
// an alumnus that was bought by linking to the buyer's announcement of it. a
// link into a page names the buyer, not the company, so it is not read as a
// name.
//
// twelve logos are left with nothing to be named by — eleven filed under
// client-logo-front-N.png and the acquired one above. every one of them is an
// alumnus, so nothing the fund still holds is lost by leaving them out.

const DESKTOP = /portfolio_desktop([\s\S]*?)portfolio_mobile/;
const FILTER = /data-filter="\.([a-z]+)"[^>]*>([^<]+)</g;
const ITEM = /<div class="page_col_5 element-item portfolio_items([^"]*)">([\s\S]*?)(?=<div class="page_col_5 element-item portfolio_items|$)/g;
const LINK = /<a\b[^>]*?\bhref="(https?:\/\/[^"]+)"/;
const LOGO = /portfolio_front_img"\s+src="([^"]+)"/;
const ALUMNI = /class="portfolio_alumni">([^<]*)</;

// what the fund uploads a logo as when it does not name the company
const UNNAMED = /^(?:client-logo|view-icon)/i;
// second levels that are not the brand — "natron.energy" is Natron
const GENERIC = new Set(['com', 'co', 'net', 'org', 'gov', 'edu', 'ac', 'bio', 'ai', 'io', 'ch']);
// what a company puts in front of its brand to get a free address
const DECORATION = /^(?:hello|hey|with|get|try|use|join|my|the)(?=[a-z]{3,})/;
// a file that spells a brand rather than describing the picture
const BRAND = /^[A-Za-z][A-Za-z0-9 &.'-]{2,}$/;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// a name is only capitalised where the fund has not capitalised it itself
const titled = (s: string) =>
	s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;

// the same brand written two ways — spaces, capitals and dots set aside
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const words = (s: string) => s.split(' ').filter(Boolean).length;

const fromLogo = (src: string) =>
	clean(
		decodeURIComponent(src.split('/').pop() ?? '')
			.replace(/\.[a-z0-9]+$/i, '')
			// wordpress numbers a re-edited image and sizes a resized one
			.replace(/-e\d{8,}$/i, '')
			.replace(/^def_logo_/i, '')
			// the two halves of the hover, and the size the fund exported at
			.replace(/[-_]?(?:logo)?[-_]?(?:front|back)\d*(?:[-_]\d+)?$/i, '')
			.replace(/[-_]logo$/i, '')
			.replace(/^logo[-_]/i, '')
			// the fund numbers the copies of a file it has replaced
			.replace(/[-_]\d+$/, '')
			.replace(/[-_]+/g, ' ')
	);

const fromHost = (url: string) => {
	try {
		const address = new URL(url);
		// a link into a page names whatever the page is about, which for this
		// fund is the company that bought the one it is listing
		if (address.pathname.replace(/\/+$/, '')) return '';
		const labels = address.hostname.replace(/^www\./, '').split('.');
		if (labels.length > 1) labels.pop();
		if (labels.length > 1 && GENERIC.has(labels[labels.length - 1])) labels.pop();
		return (labels[labels.length - 1] ?? '').replace(DECORATION, '').replace(/-+/g, ' ');
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const grid = html.match(DESKTOP)?.[1];
	if (!grid) {
		throw new Error('ndcapital: the page no longer lays the portfolio out for a wide screen');
	}

	// the fund names its two sciences on the buttons that filter by them
	const sciences = new Map(
		[...grid.matchAll(FILTER)].map(([, filter, label]) => [filter, clean(label)])
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, classes, item] of grid.matchAll(ITEM)) {
		const url = item.match(LINK)?.[1] ?? '';
		const host = url ? fromHost(url) : '';
		const file = item.match(LOGO)?.[1] ?? '';
		const logo = UNNAMED.test(file.split('/').pop() ?? '') ? '' : fromLogo(file);

		// the file may respell the address, and the fuller of the two wins
		const spelled = logo && BRAND.test(logo) && key(logo) === key(host);
		const name = titled(
			spelled ? (words(logo) >= words(host) ? logo : host) : host || (BRAND.test(logo) ? logo : '')
		);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const science = classes
			.trim()
			.split(/\s+/)
			.map((filter) => sciences.get(filter) ?? '')
			.filter(Boolean);

		companies.push({
			name,
			category: [...science, clean(item.match(ALUMNI)?.[1] ?? '')].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('ndcapital: no companies in the portfolio grid');
	}

	return companies;
}
