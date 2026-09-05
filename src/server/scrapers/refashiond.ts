import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.refashiond.com';
const COLLECTION = '/fund-1-portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 20;

// squarespace. the portfolio page is a masonry gallery whose tiles carry only
// a logo — half of them captioned with the image's filename rather than the
// company — so what is read is the collection behind it, which squarespace
// serves as json and which names every company outright.
//
// the collection holds two more companies than the gallery draws, and it comes
// twenty at a time; the pages are followed until it says there are no more.
//
// each item carries the fund's thesis areas and its own tags, and its whole
// rendered write-up. the company's address is the link on the logo at the top
// of that write-up — taken from the logo's own block rather than as the first
// link on the page, because the write-ups also link to the fund's year in
// review and to co-investors.

const SITE = /sqs-block-image-link[\s\S]{0,400}?href="(https?:\/\/[^"]+)"/;
// the tag for a company that has left, which reads last
const EXIT = /^exits?$/i;
const FORMERLY = /\s*\(\s*(?:formerly|f\.?k\.?a\.?)\s+([^)]+)\)\s*$/i;

interface Item {
	title?: string;
	body?: string;
	categories?: string[];
	tags?: string[];
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let path = `${COLLECTION}?format=json`;

	for (let page = 0; page < MAX_PAGES; page += 1) {
		const resp = await fetch(`${BASE_URL}${path}`, {
			headers: { 'User-Agent': UA, Accept: 'application/json' }
		});
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${BASE_URL}${path}: ${resp.status}`);
		}
		const body = (await resp.json()) as {
			items?: Item[];
			pagination?: { nextPage?: boolean; nextPageUrl?: string };
		};

		for (const item of body.items ?? []) {
			const listed = clean(item.title ?? '');
			const former = listed.match(FORMERLY)?.[1];
			const name = clean(listed.replace(FORMERLY, ''));
			if (!name || seen.has(name)) continue;
			seen.add(name);

			const tags = [...(item.categories ?? []), ...(item.tags ?? [])]
				.map(clean)
				.filter(Boolean)
				.filter((t, i, all) => all.indexOf(t) === i);
			companies.push({
				name,
				category: [
					...tags.filter((t) => !EXIT.test(t)),
					former ? `f/k/a ${clean(former)}` : '',
					...tags.filter((t) => EXIT.test(t))
				]
					.filter(Boolean)
					.join(', '),
				url: item.body?.match(SITE)?.[1] ?? ''
			});
		}

		const next = body.pagination;
		if (!next?.nextPage || !next.nextPageUrl) break;
		path = `${next.nextPageUrl}&format=json`;
	}

	if (companies.length === 0) {
		throw new Error('refashiond: no companies in the portfolio collection');
	}

	return companies;
}
