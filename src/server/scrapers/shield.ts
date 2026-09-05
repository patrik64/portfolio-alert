import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://shieldcap.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, the portfolio a gallery of logos near the foot of the one-page
// site. the fund uploaded them without alt text, so squarespace fills that in
// with the filename — but the filenames are tidy, "logo-starfish-space.png",
// and are what name the companies here.
//
// the page's other galleries are photographs of the fund's areas of focus,
// which is why only the files named logo- are read, and the fund's own emblems
// among those are skipped.
//
// one company is shown without a link, so it keeps no address.

const SLIDE = /<div class="slide"[\s\S]*?(?=<div class="slide"|<\/div><\/div><\/div>)/g;
const LOGO = /(?:data-image|src)="([^"]*\/logo-[^"/?]+)"/;
const SITE = /<a[^>]*href="(https?:\/\/[^"]+)"/;
// the fund's own marks, not companies
const OWN = /shield/i;
// the copy number squarespace adds to a re-uploaded file
const COUNTER = /-\d+$/;

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const slide of html.match(SLIDE) ?? []) {
		const file = slide.match(LOGO)?.[1]?.split('/').pop() ?? '';
		if (!file || OWN.test(file)) continue;

		const name = capitalize(
			decodeURIComponent(file)
				.replace(/\.\w+$/, '')
				.replace(/^logo-/, '')
				.replace(COUNTER, '')
				.replace(/-+/g, ' ')
				.trim()
		);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: slide.match(SITE)?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('shield: no companies on the portfolio page');
	}

	return companies;
}
