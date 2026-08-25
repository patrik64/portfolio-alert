import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://ziggcap.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-written static page: each portfolio anchor links the company site
// and holds a description that opens with the company name followed by a
// lowercase verb ("Juniper Square is …", "Corner Health provides …"). the
// logo alts are less reliable (typos, one stale name), so the description
// leads and the alt is only a fallback

function nameFromDescription(desc: string): string {
	const taken: string[] = [];
	for (const word of desc.split(/\s+/)) {
		if (/^[A-Z0-9]/.test(word) || (taken.length > 0 && word === '&')) {
			taken.push(word.replace(/[.,:;]+$/, ''));
		} else break;
	}
	const name = taken.join(' ');
	return name.length <= 40 ? name : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	// a comment in the page carries a copy-paste template card ("COMPANY NAME")
	// for whoever maintains the site — parse only what actually renders
	const html = (await resp.text()).replace(/<!--[\s\S]*?-->/g, '');

	const companies: ScrapedCompany[] = [];
	for (const anchor of html.split('class="portfolio__logo"').slice(1)) {
		const url = anchor.match(/^\s*href="\s*(https?:\/\/[^"\s]+)\s*"/)?.[1] ?? '';
		const desc = (anchor.match(/<p class="description">\s*([\s\S]*?)\s*<\/p>/)?.[1] ?? '')
			.replace(/\s+/g, ' ')
			.trim();
		if (!url || !desc) continue;
		const alt = (anchor.match(/alt="([^"]*?)\s*logo"/)?.[1] ?? '')
			.split(/\s+/)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
		const name = nameFromDescription(desc) || alt;
		if (!name) continue;
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('zigg: no companies found on the portfolio page');
	}

	return companies;
}
