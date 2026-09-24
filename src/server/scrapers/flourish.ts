import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://flourishventures.com/portfolio/';
const MAX_PAGES = 20;
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio is forty posts to a page behind "Load More"
// (?post-page=2), each a card naming the company over its investment theme,
// its country and, for one the fund is out of, "Exited". a card links the
// company's page here, which writes the site out as the text of its link;
// those pages are fetched in batches, and one that will not load leaves its
// company linking to that page. each page of the list also carries the
// template its script fills in ("{{post_title}}"), which is passed over.

const POST = /(?=<div class="kpfsc__post">)/;
const PAGE = /<a class="kpfsc__post-wrap" href="([^"]+)"/;
const NAME = /class="kpfsc__post-title">([\s\S]*?)<\/div>/;
const THEME = /class="kpfsc__post-type">([\s\S]*?)<\/div>/;
const PLACE = /class="kpfsc__location-name">([\s\S]*?)<\/span>/;
const FUNDING = /class="kpfsc__funding">([\s\S]*?)<\/div>/;
const MORE = /class="kpfsc__load-more"/;
const ANCHOR = /<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
// the address, written out as the text of its own link
const WRITTEN_OUT = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
const STEALTH = /^stealth\b/i;

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

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

async function siteOf(page: string): Promise<string> {
	try {
		const html = await fetchText(page);
		const own = [...html.matchAll(ANCHOR)].find(
			(m) => WRITTEN_OUT.test(clean(m[2])) && !/flourishventures\.com/i.test(m[1])
		);
		return own ? unescape(own[1]) : '';
	} catch {
		return '';
	}
}

interface Card {
	name: string;
	page: string;
	category: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const cards: Card[] = [];
	const seen = new Set<string>();
	for (let n = 1; n <= MAX_PAGES; n++) {
		const html = await fetchText(n === 1 ? PAGE_URL : `${PAGE_URL}?post-page=${n}&search=`);
		let added = 0;
		for (const post of html.split(POST).slice(1)) {
			const name = clean(post.match(NAME)?.[1] ?? '');
			if (!name || /\{\{/.test(name) || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			added++;
			const exited = /^exited$/i.test(clean(post.match(FUNDING)?.[1] ?? ''));
			cards.push({
				name,
				page: unescape(post.match(PAGE)?.[1] ?? ''),
				category: [
					tag(post.match(THEME)?.[1] ?? ''),
					tag(post.match(PLACE)?.[1] ?? ''),
					exited ? 'Exited' : ''
				]
					.filter(Boolean)
					.join(', ')
			});
		}
		if (added === 0 || !MORE.test(html)) break;
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < cards.length; i += BATCH_SIZE) {
		const batch = cards.slice(i, i + BATCH_SIZE);
		const sites = await Promise.all(batch.map((c) => (c.page ? siteOf(c.page) : Promise.resolve(''))));
		batch.forEach((c, j) => companies.push({ name: c.name, category: c.category, url: sites[j] || c.page }));
	}

	if (companies.length === 0) {
		throw new Error('flourish: no companies on the portfolio page');
	}

	return companies;
}
