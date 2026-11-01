import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.leafytunnel.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: a gallery of logos, linked to the company's site on most, whose alt
// text is the file's name ("image.png"), so the companies are named from a list
// looked up once, keyed by the image's id. one missing from it is named after its
// address until it is added. the AtaiBeckley image is stamped "Exit" and links a
// press release of Lilly's rather than the company's site, so the link is left out.
const NAMES: Record<string, string> = {
	'6470a913b96d9750a13723ec': 'Tetra Pharm Technologies',
	'6470a98b3fb8a75772a256c6': 'Prohibition Partners',
	'6470a99dda95d26d08ed61a7': 'Maya Health',
	'6470aa1eb48c794d8cb9d164': 'IUVO Therapeutics',
	'6470ab231c555d5b874d4a66': 'Tactogen',
	'6470abba64a8776ce0d5a8f2': 'Ceretype Neuromedicine',
	'67d999c82c92961a757bd2e3': 'Hoodie Analytics',
	'67d999fb93927b6765aa631e': 'Cantourage',
	'67d99a293cc07e6038e81e9d': '2A Biosciences',
	'6996dff1732475272052a0e9': 'Amandala Neuro',
	// its logo says Lykos Therapeutics, "now known as" this
	'6aad572c16132912c239921e': 'Resilient Pharmaceuticals',
	'6aabe7848d03814556961e98': 'AtaiBeckley'
};
const EXITED = new Set(['6aabe7848d03814556961e98']);

const SLIDE = /(?=class="slide")/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const IMAGE_ID = /\bdata-image-id="([0-9a-f]+)"/;

// "hello-bio.com" -> "Hello Bio"
const nameFrom = (url: string) =>
	new URL(url).hostname
		.replace(/^www\./, '')
		.split('.')[0]
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const slides = (await resp.text()).split(SLIDE).slice(1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const slide of slides) {
		const id = slide.match(IMAGE_ID)?.[1] ?? '';
		const link = slide.match(LINK)?.[1] ?? '';
		const name = NAMES[id] ?? (link ? nameFrom(link) : '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: EXITED.has(id) ? 'Exited' : '', url: EXITED.has(id) ? '' : link });
	}

	if (companies.length === 0) {
		throw new Error('leafytunnel: no companies on the portfolio page');
	}

	return companies;
}
