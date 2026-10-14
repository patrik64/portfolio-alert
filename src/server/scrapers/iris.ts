import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.iris.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of logos, the whole list in the page, a
// logo a company, with its address written beneath ("qovery.com") and a
// panel giving a line about it and its site. each carries, for the page's
// filters, its status ("Active", "Exited"), the strategy it was backed
// from ("Venture", "Growth"), where it is ("France", "Global") and its
// categories ("AI & Data", "Enterprise SaaS"); an exited company shows how
// ("Acquired by SAP", "IPO on Nasdaq", "Secondary transaction").
//
// the name is the logo's alt text, "Opsmill logo" read as Opsmill; a few
// logos have none, and the company is then named after its address. the
// categories, the strategy and the place are kept as tags, a buyer as
// "Acquired by …", a listing as IPO, and any exit with the Exited tag.

// the alt texts the page has wrong, as its logos and addresses spell them
const CORRECTED: Record<string, string> = {
	Gestafe: 'Getsafe'
};

const ITEM = /(?=<div\b[^>]*role="listitem" class="portfolio-logo_item w-dyn-item">)/;
const LOGO = /<img loading="lazy" alt="([^"]*)"/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([^<]*)<`, 'g');
const SITE = /<a\b[^>]*href="([^"]*)" class="button-border is-small w-inline-block"><div\b[^>]*>\s*WEBSITE/;
// the address written beneath the logo
const ADDRESS = /<div class="heading-style-h6 text-style-allcaps">([^<]*)<\/div>/;
// how an exited company went, shown only on one
const EXIT = /class="portfolio-logo_exited-wrapper"[\s\S]*?class="heading-style-h5 text-color-white text-style-allcaps">([^<]+)</;
const LOGO_WORD = /\s+logo$/i;
const BUYER = /^acquired by\s+(.+)$/i;
const IPO = /\bipo\b/i;
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "qovery.com", "https://www.qovery.com/" -> "Qovery"
function nameFrom(address: string): string {
	const host = address
		.replace(/^https?:\/\/(?:www\.)?/i, '')
		.split(/[/?#]/)[0]
		.split('.')[0];
	return host ? host[0].toUpperCase() + host.slice(1) : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		const alt = clean(item.match(LOGO)?.[1] ?? '').replace(LOGO_WORD, '');
		const written = alt || nameFrom(clean(item.match(ADDRESS)?.[1] ?? '')) || nameFrom(site);
		const name = CORRECTED[written] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// each filter field is written twice, for the logo and its exit view
		const field = (key: string) => [...item.matchAll(FIELD(key))].map(([, value]) => tag(value));
		const exit = clean(item.match(EXIT)?.[1] ?? '');
		const buyer = exit.match(BUYER)?.[1];
		const out = field('status').some((status) => EXITED.test(status)) || !!exit;
		companies.push({
			name,
			category: [
				...field('category'),
				...field('activity'),
				...field('location'),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				IPO.test(exit) ? 'IPO' : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('iris: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
