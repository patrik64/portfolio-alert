import type { ScrapedCompany } from './types';

const BASE_URL = 'https://radical.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const COMPANIES_URL = `${BASE_URL}/wp-json/wp/v2/company?per_page=100`;
const TAGS_URL = `${BASE_URL}/wp-json/wp/v2/company_tag?per_page=100`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// wordpress. the portfolio page is a wall of logos with no names and no alt
// text, so the companies come from the rest api, which names them and carries
// the sector slugs in each one's class list; a second call spells those slugs
// out. the api holds two companies the wall does not draw.
//
// what the api does not carry is the address or how an investment ended. the
// wall marks six companies "Acquired" or "IPO" against the link to the fund's
// own write-up, which is how those are matched on; the write-ups themselves
// carry the company's address, and are fetched in batches.

const ITEM = /<a href="([^"]*)" class="portfolio-item">\s*<span class="exited-tag">([^<]*)<\/span>/g;
const LINK = /href="(https?:\/\/[^"]+)"/g;
const TAG_SLUG = /^company_tag-(.+)$/;
// the fund's own pages, its job board, and the furniture every wordpress page
// carries
const NOT_THE_COMPANY =
	/radical\.vc|radical\.getro|w3\.org|gmpg\.org|wordpress|google|gstatic|facebook|twitter|linkedin|instagram|youtube/i;

interface Company {
	title?: { rendered?: string };
	link?: string;
	class_list?: string[];
}
interface Term {
	slug?: string;
	name?: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const records = JSON.parse(await fetchText(COMPANIES_URL)) as Company[];
	if (records.length === 0) {
		throw new Error('radical: the company collection came back empty');
	}
	const terms = JSON.parse(await fetchText(TAGS_URL)) as Term[];
	const labels = new Map(terms.map((t) => [t.slug ?? '', clean(t.name ?? '')]));

	const page = (await fetchText(PAGE_URL)).replace(/\s+/g, ' ');
	const exits = new Map(
		[...page.matchAll(ITEM)].map((m) => [m[1].replace(/\/$/, ''), clean(m[2])] as [string, string])
	);

	const listed = records
		.map((r) => ({
			name: clean(r.title?.rendered ?? ''),
			page: clean(r.link ?? ''),
			sectors: (r.class_list ?? [])
				.map((c) => c.match(TAG_SLUG)?.[1])
				.filter((s): s is string => Boolean(s && labels.get(s)))
				.map((s) => labels.get(s) as string)
		}))
		.filter((c) => c.name);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((c) => (c.page ? fetchText(c.page).catch(() => '') : ''))
		);
		batch.forEach((c, j) => {
			if (seen.has(c.name)) return;
			seen.add(c.name);
			companies.push({
				name: c.name,
				category: [...c.sectors, exits.get(c.page.replace(/\/$/, '')) ?? '']
					.filter(Boolean)
					.join(', '),
				url:
					[...pages[j].matchAll(LINK)].map((m) => m[1]).find((u) => !NOT_THE_COMPANY.test(u)) ?? ''
			});
		});
	}

	return companies;
}
