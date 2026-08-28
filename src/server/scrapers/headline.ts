import type { ScrapedCompany } from './types';

const BASE_URL = 'https://headline.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is Gatsby over Sanity: the portfolio listing ships as static JSON
// at page-data/portfolio/page-data.json (name, location, sectors), and each
// company's own page-data adds the website and the exit record
const LIST_URL = `${BASE_URL}/page-data/portfolio/page-data.json`;
const detailUrl = (slug: string) => `${BASE_URL}/page-data/portfolio/${slug}/page-data.json`;

const BATCH_SIZE = 20;

interface Titled {
	title?: string;
}

interface ListedCompany {
	title?: string;
	slug?: { current?: string };
	location?: string;
	hidden?: boolean | null;
	sectors?: { sector?: Titled }[];
}

interface DetailPage {
	// "Exit (Acquired by Twilio)" — the outcome records exits
	outcome?: { phase?: string }[];
	structuredData?: { url?: string | null };
}

async function fetchJson(url: string): Promise<unknown> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const listing = (await fetchJson(LIST_URL)) as {
		result?: { data?: { companies?: { nodes?: ListedCompany[] } } };
	};
	// the CMS holds bare stubs too (a title and nothing else); only entries
	// with a slug render on the public page, so only those count
	const nodes = (listing.result?.data?.companies?.nodes ?? []).filter(
		(c) => c.title && c.slug?.current && c.hidden !== true
	);
	if (nodes.length === 0) {
		throw new Error('headline: no companies in the page data');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
		await Promise.all(
			nodes.slice(i, i + BATCH_SIZE).map(async (node) => {
				const slug = node.slug?.current ?? '';
				// a company whose own page is missing still counts — it just
				// keeps its listing data and points at the portfolio page
				let detail: DetailPage = {};
				if (slug) {
					try {
						const data = (await fetchJson(detailUrl(slug))) as {
							result?: { data?: { page?: DetailPage } };
						};
						detail = data.result?.data?.page ?? {};
					} catch {
						// fall through with listing data only
					}
				}
				const exited = (detail.outcome ?? []).some((o) => /exit/i.test(o.phase ?? ''));
				companies.push({
					name: node.title!.trim(),
					category: [
						...(node.sectors ?? []).map((s) => s.sector?.title ?? '').filter(Boolean),
						node.location ?? '',
						exited ? 'Exited' : ''
					]
						.filter(Boolean)
						.join(', '),
					url: detail.structuredData?.url || (slug ? `${PAGE_URL}/${slug}` : '')
				});
			})
		);
	}

	return companies;
}
