import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.schematicventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow. what a card writes under the logo is what the company does —
// "Air Freight AI", "Warehouse Robotics" — not what it is called, and the logo
// has no alt text. the fund names its logo files after the companies, though,
// and keeps them tidy: Aircon.png, Plus One Robotics.png, P-1 AI.png.
//
// beside the descriptor sit the round the fund came in at and the year it did,
// and the company's address. the round is recorded; the year is about the
// fund's own history.

const ITEM = 'role="listitem" class="collection-item w-dyn-item w-col w-col-3"';
const LOGO = /class="image-portfolio" src="([^"]*)"/;
const STAGE = /<div class="text-block-3">([^<]*)<\/div>/;
const SITE = /<a href="(https?:\/\/[^"]*)"/;
const HASH = /^[0-9a-f]{18,}_/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(
			decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '')
				.replace(HASH, '')
				.replace(/\.\w+$/, '')
		);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: clean(item.match(STAGE)?.[1] ?? ''),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('schematic: no companies on the portfolio page');
	}

	return companies;
}
