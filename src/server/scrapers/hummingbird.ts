import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.hummingbird.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow. every company is a row naming it, with its sector, the region and
// country it works from, the year the fund partnered with it, the stage or
// stages it came in at, its site, and an "Exit" mark that webflow hides on
// the companies still held. each row is drawn twice — once for a company with
// a site and once for one without, the wrong one hidden — so the rows are
// deduplicated by name, keeping the one with an address.

const ROW = /(?=<[a-z]+[^>]*class="[^"]*\bgrid-item-row\b)/;
const NAME = /class="companies-name"><p[^>]*>([\s\S]*?)<\/p>/;
const EXIT = /<p class="([^"]*)">\s*Exit\s*<\/p>/;
const SECTOR = /fs-cmsfilter-field="sector"[^>]*>([\s\S]*?)<\/p>/;
const REGION = /fs-cmsfilter-field="region"[^>]*>([\s\S]*?)<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/;
const YEAR = /class="numbers-wrap[^"]*"><p[^>]*>([\s\S]*?)<\/p>/;
const STAGE = /fs-cmsfilter-field="partnered"[^>]*>([\s\S]*?)<\/p>/g;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="company-link/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// one address was saved as it was clicked on in an advert, tracking and all
function website(raw: string): string {
	const url = unescape(raw);
	const [address, query] = url.split('?');
	if (!query) return url;
	const kept = query
		.split('&')
		.filter((param) => !/^(gclid|gbraid|wbraid|fbclid|msclkid|gad_[a-z_]*|utm_[a-z]*)=/i.test(param));
	return kept.length > 0 ? `${address}?${kept.join('&')}` : address;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies = new Map<string, ScrapedCompany>();
	for (const row of html.split(ROW).slice(1)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name) continue;
		const url = website(row.match(SITE)?.[1] ?? '');
		const known = companies.get(name.toLowerCase());
		if (known && (known.url || !url)) continue;

		const exit = row.match(EXIT)?.[1];
		const region = row.match(REGION);
		const year = clean(row.match(YEAR)?.[1] ?? '');
		companies.set(name.toLowerCase(), {
			name,
			category: [
				tag(row.match(SECTOR)?.[1] ?? ''),
				tag(region?.[1] ?? ''),
				tag(region?.[2] ?? ''),
				...new Set([...row.matchAll(STAGE)].map((m) => tag(m[1]))),
				/^\d{4}$/.test(year) ? `Invested ${year}` : '',
				exit !== undefined && !exit.includes('w-condition-invisible') ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.size === 0) {
		throw new Error('hummingbird: no companies on the portfolio page');
	}

	return [...companies.values()];
}
