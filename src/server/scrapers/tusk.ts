import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.tusk.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 20;

// webflow, fifteen cards to a page behind ?ab74f670_page=N. a card is a logo,
// a sector, a link to the company and a bar reading "Exited" where it has.
//
// nothing names a company but the logo's filename, which is the fund's own
// design file and says so: "Kodiak Logo Red Big", "Sunday-lawn-care-logo-
// vector". the company's hostname is what tells the name from the rest of the
// filename — the longest run of its words the hostname bears out — and where
// the hostname bears out nothing (thecontractnetwork.com against TCN) the
// filename stands with its design words stripped.

const CARD = 'class="portfolio-p__card"';
const LOGO = /\/([^/"?]+)\.(?:png|jpe?g|svg|webp)/i;
const SITE = /href="(https?:\/\/[^"]+)"/;
const STATUS = /class="status__bar"><div>([^<]*)</;
const SECTOR = /fs-cmsfilter-field="category" class="[^"]*">([^<]*)</;

// what a design file is called besides the company. these come off before the
// hostname is consulted: "bird logo" against bird.co would otherwise pass as a
// company called Bird Logo, the hostname sitting inside it
const DRESSING =
	/^(logos?|logotype|brandmark|wordmark|primarylogo|icon|stacked|vector|preview|final|new|big|small|colou?r|red|blue|black|white|green|\d+|a?\(?\d+\)?)$/i;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const capitalize = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
};

function nameFor(file: string, url: string): string {
	// webflow prefixes every upload with the asset's id
	const words = decodeURIComponent(file)
		.replace(/^[0-9a-f]{16,}_/i, '')
		.split(/[^A-Za-z0-9]+/)
		.filter((word) => word && !DRESSING.test(word));
	const host = url ? key(hostLabel(url)) : '';

	if (host) {
		for (let len = words.length; len > 0; len--) {
			for (let start = 0; start + len <= words.length; start++) {
				const run = words.slice(start, start + len);
				const k = key(run.join(''));
				if (k.length > 1 && (host.includes(k) || k.includes(host))) {
					return capitalize(run.join(' '));
				}
			}
		}
	}
	// the hostname bears out nothing — the filename is all there is
	return capitalize(words.join(' '));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = page === 1 ? PAGE_URL : `${PAGE_URL}?ab74f670_page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		// the filter buttons are a collection list of their own, so the cards are
		// taken from the portfolio list alone
		const at = html.indexOf('portfolio__coll-list');
		const cards = at < 0 ? [] : html.slice(at).split(CARD).slice(1);
		if (cards.length === 0) break;

		for (const card of cards) {
			const site = card.match(SITE)?.[1] ?? '';
			const file = card.match(LOGO)?.[1] ?? '';
			if (!file) continue;
			const name = nameFor(file, site);
			if (!name || seen.has(name)) continue;
			seen.add(name);

			const status = (card.match(STATUS)?.[1] ?? '').trim();
			companies.push({
				name,
				category: [(card.match(SECTOR)?.[1] ?? '').trim(), status]
					.filter(Boolean)
					.join(', '),
				url: site
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('tusk: no companies on the portfolio page');
	}

	return companies;
}
