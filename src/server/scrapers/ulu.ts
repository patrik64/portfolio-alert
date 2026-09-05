import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://uluventures.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the page is logos twice over — a row of flip cards for the
// best-known companies, then a masonry grid for the whole portfolio, nine
// companies appearing in both. neither states a name in text; the logo's alt
// does ("BetterUp logo"), and it is the fund's own writing, so it is trusted
// once the word logo and any note about the image's background come off.
//
// the fund's "new_investments" feed names companies too, but holds only the
// recent ones and carries each of several besides — the page is the portfolio.
//
// no sectors, stages or exit markers anywhere, so every category is empty.

const FLIP = {
	marker: 'class="bdt-flip-box"',
	href: /class="bdt-flip-box-layer bdt-flip-box-back" href="([^"]*)"/
};
const MASONRY = { marker: 'class="masonryPostGridItem"', href: /href="([^"]*)"/ };

// "Candid Logo White Background" is a note about the picture, not the company
const DRESSING = /\s*(?:logo(?:type)?)?\s*(?:white|black|dark|light)?\s*(?:background|bg)?\s*$/i;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { marker, href } of [MASONRY, FLIP]) {
		for (const item of html.split(marker).slice(1)) {
			const alt = item.match(/alt="([^"]+)"/)?.[1] ?? '';
			const name = (alt.replace(DRESSING, '').trim() || alt.trim()).replace(/\s+/g, ' ');
			if (!name || seen.has(name)) continue;
			seen.add(name);
			// the links carry a "#new_tab" the theme reads to open a new window
			const link = (item.match(href)?.[1] ?? '').split('#')[0];
			companies.push({
				name,
				category: '',
				url: /^https?:\/\//.test(link) ? link : ''
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('ulu: no companies on the page');
	}

	return companies;
}
