import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.scifounders.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow. every card is a link to the company with a white logo over
// it and a line about what it does; webflow renders the list twice, so each
// company appears twice and only the first is kept.
//
// the logos carry no alt text, so the filename names the company once the
// design words are stripped out of it — "Trace-Biosciences-logo-01-white.png".
// one of them is initials, "Nlbwnew.png", and says nothing about newlimit.com,
// so where the filename and the company's own domain have nothing in common
// the domain is used instead.

const ITEM = '<div role="listitem" class="portfolio-card-item w-dyn-item">';
const LOGO = /<img src="([^"]*)"[^>]*class="portfolio-overlay-logo"/;
const SITE = /<a href="(https?:\/\/[^"]*)"/;
const HASH = /^[0-9a-f]{18,}_/;
// what a logo file is called besides the company
const DRESSING =
	/^(logos?|logomark|logotype|wordmark|white|black|colou?r|transparent|background|notagline|tagline|horiz|horizontal|vertical|full|rgb|cmyk|on|no|w|px|\d+px|\d+|[0-9a-f]{8,})$/i;
const MIN_SHARED = 4;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^ai$/i.test(w) ? 'AI' : /^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

// do the two strings have any run of four characters in common
function related(a: string, b: string): boolean {
	if (!a || !b) return false;
	for (let i = 0; i + MIN_SHARED <= a.length; i++) {
		if (b.includes(a.slice(i, i + MIN_SHARED))) return true;
	}
	return false;
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
		const site = item.match(SITE)?.[1] ?? '';
		let label = '';
		try {
			label = new URL(site).hostname.replace(/^www\./, '').split('.')[0];
		} catch {
			label = '';
		}

		const file = decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '')
			.replace(HASH, '')
			.replace(/\.\w+$/, '');
		const words = file.split(/[^A-Za-z0-9]+/).filter((w) => w && !DRESSING.test(w));

		const fromFile = words.join(' ');
		const name = capitalize(related(key(fromFile), key(label)) ? fromFile : label);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: site });
	}

	if (companies.length === 0) {
		throw new Error('scifounders: no companies on the portfolio page');
	}

	return companies;
}
