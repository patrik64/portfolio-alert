import type { ScrapedCompany } from './types';

const LIST_URL = 'https://truewealthvc.com/wp-json/wp/v2/avada_portfolio?per_page=100';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page itself is sliders and carousels, so the
// companies are read from the "avada_portfolio" post type instead.
//
// the post carries no field for the company's site — the address is a link in
// the write-up, and the write-up also carries a carousel of the fund's other
// companies, so the first link out is as often as not somebody else's. the
// company's own link is the one written under its name, which is how it is
// picked out ("BrainCheck's" belongs to BrainCheck).
//
// the fund publishes no sectors and marks no exits, so categories are empty.

const NOT_THE_COMPANY =
	/truewealthvc|facebook\.com|twitter\.com|linkedin\.com|instagram\.com|youtube\.com|wordpress|google\./i;
const LINK = /href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/g;

interface Post {
	title?: { rendered?: string };
	link?: string;
	content?: { rendered?: string };
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(LIST_URL, {
		headers: { 'User-Agent': UA, Accept: 'application/json' }
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${LIST_URL}: ${resp.status}`);
	}
	const posts = (await resp.json()) as Post[];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts ?? []) {
		const name = (post.title?.rendered ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const wanted = key(name);
		let site = '';
		for (const [, href, label] of (post.content?.rendered ?? '').matchAll(LINK)) {
			if (NOT_THE_COMPANY.test(href)) continue;
			const text = key(label.replace(/<[^>]+>/g, ''));
			// the link written under the company's name, possessive and all
			if (text && (text.startsWith(wanted) || wanted.startsWith(text))) {
				site = href;
				break;
			}
		}

		companies.push({
			name,
			category: '',
			// a company whose write-up links it nowhere keeps its page on the fund's site
			url: site || post.link || ''
		});
	}

	if (companies.length === 0) {
		throw new Error('truewealth: no companies in the portfolio feed');
	}

	return companies;
}
