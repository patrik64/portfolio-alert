import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://morpheus.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// wordpress with the essential grid plugin, which names each grid it draws.
// the page holds two: the portfolio, and one the fund calls prior-investments
// under a heading saying they were made by morpheus, its founders, or funds
// previously managed by them. the second is left out the way partners' earlier
// investments are elsewhere — taking the page at face value would credit this
// fund with Skype and FanDuel — and a grid named that way is what marks it.
//
// a tile carries no name in its text, only a tagline; the name is the alt on
// the logo. one of those alts has the company's fate typed onto the end of it,
// "Bridg Acquired", so that word comes off the name and is kept as what it
// says instead. there is nothing else to file a company under here: the fund
// publishes no sectors, and the tagline is a sentence rather than a label.
//
// the tile links to the fund's own page for a company, and that page states
// the address under a Website heading — all twenty of them do — so the twenty
// are fetched to send a reader to the company rather than to the fund. Drop's
// address is frescocooks.com, which is what the fund publishes for it.

const GRID = /<article\b[^>]*\bdata-alias="([^"]*)"([\s\S]*?)<\/article>/g;
// the fund's own word for the grid that is not its portfolio
const NOT_THE_PORTFOLIO = /prior|previous|other/i;
const TILE = /<li id="eg-[^"]*"[\s\S]*?(?=<li id="eg-|<\/ul>)/g;
const LOGO = /<img[^>]*\balt="([^"]*)"/g;
const PAGE = /<a href="(https:\/\/morpheus\.com\/portfolio\/[^"]+)"/;
// the label the plugin puts on every tile's image, which names nothing
const NOT_A_NAME = /^portfolio$/i;
// what the fund types onto a name when the company has been bought
const SOLD = /\s+(acquired)\s*$/i;
const SITE = /<strong>\s*Website\s*<\/strong>[\s\S]{0,200}?<a[^>]*\bhref="([^"]*)"/;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
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

	const listed: { name: string; state: string; page: string }[] = [];
	const seen = new Set<string>();
	for (const [, alias, grid] of html.matchAll(GRID)) {
		if (NOT_THE_PORTFOLIO.test(alias)) continue;

		for (const [tile] of grid.matchAll(TILE)) {
			const labelled = [...tile.matchAll(LOGO)]
				.map((logo) => clean(logo[1]))
				.filter((label) => label && !NOT_A_NAME.test(label));
			const name = (labelled[0] ?? '').replace(SOLD, '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			listed.push({
				name,
				// the fund writes it with a capital where it uses it
				state: labelled[0]?.match(SOLD) ? 'Acquired' : '',
				page: tile.match(PAGE)?.[1] ?? ''
			});
		}
	}

	if (listed.length === 0) {
		throw new Error('morpheus: no companies in the portfolio grid');
	}

	// each company's own address, which is only on the fund's page for it
	const companies: ScrapedCompany[] = [];
	for (let at = 0; at < listed.length; at += BATCH_SIZE) {
		const batch = listed.slice(at, at + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((company) => (company.page ? fetchText(company.page) : Promise.resolve('')))
		);
		batch.forEach((company, index) => {
			const site = clean(pages[index].match(SITE)?.[1] ?? '');
			companies.push({
				name: company.name,
				category: company.state,
				url: /^https?:\/\//i.test(site) ? site : company.page
			});
		});
	}

	return companies;
}
