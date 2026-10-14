import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.vertis.it';
const PAGE_URL = `${BASE_URL}/portafoglio/`;
// the companies' own records, as wordpress serves the site's posts
const DATA_URL = `${BASE_URL}/wp-json/wp/v2/new-portfolio?per_page=100&_fields=id,title,content`;
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the portfolio page is a grid of logos, the
// whole of it in the page, a logo a company linking its page here and
// classed for the page's filter by the funds it sits in ("Vertis Venture 6
// Digital Sud"). the logos have no alt text and the company pages show the
// name nowhere but in their logo, so the name is the company's own post
// title in the site's records ("LATITUDO 40", "come stai"), each record
// also writing where it is ("Sede: Napoli, Campania"), its sector, the
// month the fund invested ("Data investimento: Settembre 2026") and a link
// to its site ("Vai al sito"), a company without one linking its page
// here. the grid says which companies are listed; a listed company without
// a record has no name to list it by and fails the run, and so does a page
// of the records that will not load. the funds, the sector, the place and
// the year are kept as tags; the fund does not say which companies it is
// out of.

const ITEM = /(?=<div data-elementor-type="loop-item")/;
const POST = /^<div\b[^>]*\bclass="[^"]*\be-loop-item-(\d+)\b([^"]*)"/;
const PAGE = /<a href="([^"]*)"/;
const FUND_CLASS = /\bportfolio-category-new-portfolio-([a-z0-9-]+)/g;
const FILTER = /<button class="e-filter-item" data-filter="([^"]+)"[^>]*>([^<]*)</g;
const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?Vai al sito/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Post {
	id?: number;
	title?: { rendered?: string };
	content?: { rendered?: string };
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&hellip;/g, '…')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchPage(url: string): Promise<Response> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp;
}

// a record's facts, by the label each paragraph opens on: "Sede: Napoli, Campania"
function factsOf(content: string): Map<string, string> {
	const facts = new Map<string, string>();
	for (const [, paragraph] of content.matchAll(PARAGRAPH)) {
		const text = clean(paragraph);
		const at = text.indexOf(':');
		if (at > 0) facts.set(text.slice(0, at).trim().toLowerCase(), text.slice(at + 1).trim());
	}
	return facts;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await (await fetchPage(PAGE_URL)).text();
	const funds = new Map([...html.matchAll(FILTER)].map(([, slug, label]) => [slug, tag(label)]));
	const items = html
		.split(ITEM)
		.slice(1)
		.map((item) => {
			const [, id = '0', classes = ''] = item.match(POST) ?? [];
			return {
				id: Number(id),
				href: unescape(item.match(PAGE)?.[1] ?? '').trim(),
				funds: [...classes.matchAll(FUND_CLASS)].map(([, slug]) => funds.get(slug) ?? '')
			};
		});

	// every record, a page at a time; a part of them must not pass for the whole
	const posts = new Map<number, Post>();
	for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
		const resp: Response = await fetchPage(`${DATA_URL}&page=${page}`);
		pages = Number(resp.headers.get('x-wp-totalpages') ?? 1) || 1;
		const batch: Post[] = await resp.json();
		for (const post of batch) if (post?.id) posts.set(post.id, post);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const item of items) {
		const post = posts.get(item.id);
		const name = clean(post?.title?.rendered ?? '');
		if (!name) {
			throw new Error(`vertis: the grid lists post ${item.id}, which the records do not name — the records moved`);
		}
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const content = post?.content?.rendered ?? '';
		const facts = factsOf(content);
		const fact = (label: RegExp) => [...facts].find(([key]) => label.test(key))?.[1] ?? '';
		const year = fact(/^data investimento$/).match(YEAR)?.[0];
		const site = unescape(content.match(SITE)?.[1] ?? '').trim();
		if (site) withSite++;
		companies.push({
			name,
			category: [
				...item.funds,
				tag(fact(/^categoria/)),
				...fact(/^sede$/).split(',').map(tag),
				year ? `Invested ${year}` : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || (/^https?:\/\//i.test(item.href) ? item.href : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('vertis: no companies in the portfolio grid — the markup moved');
	}
	// without the records' links every company would link the page here
	if (withSite === 0) {
		throw new Error("vertis: no record linked its company's site — the records moved");
	}

	return companies;
}
