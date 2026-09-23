import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.hetz.vc/our-portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow. the portfolio is a grid of logos, each opening a popup that names
// the company, gives a year and a link to its site; the fund's tags for it sit
// in a hidden list the filters read, and a company the fund is out of carries
// a badge naming its buyer ("Acquired by Check Point") that webflow hides on
// the rest. the page never says what the year counts — the investment or the
// founding — so it is recorded bare.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*cl-item-portfolio)/;
const NAME = /class="text-medium text-canela">([\s\S]*?)<\/div>/;
const YEAR = /class="text-regular text-margin-right">\s*(\d{4})\s*</;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*>\s*Visit website/;
const TAG = /fs-cmsfilter-field="tag"[^>]*>([\s\S]*?)<\/div>/g;
// the badge, and the words in it, when webflow shows it
const ACQUIRED = /class="acquired-wrapper(?![^"]*w-condition-invisible)[^"]*">[\s\S]*?class="text-small[^"]*">([\s\S]*?)<\/div>/;

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

// URL normalizes the occasional capitalized hostname ("Infinipoint.io")
const address = (href: string) => {
	if (!href) return '';
	try {
		return new URL(unescape(href)).href;
	} catch {
		return unescape(href);
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const acquired = clean(item.match(ACQUIRED)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...new Set([...item.matchAll(TAG)].map((m) => tag(m[1])).filter(Boolean)),
				item.match(YEAR)?.[1] ?? '',
				tag(acquired),
				acquired ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: address(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('hetz: no companies on the portfolio page');
	}

	return companies;
}
