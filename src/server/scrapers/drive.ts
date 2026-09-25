import type { ScrapedCompany } from './types';

const BASE_URL = 'https://drivecapital.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over contentful: the portfolio page carries its list in the
// __NEXT_DATA__ script — a name, a status ("Active", or how the fund got
// out) and the industry each company is filed under — and each company's
// page, in the same script, a "VIEW WEBSITE" link and the city it is in.
// so those pages are fetched for the sites; one that will not load leaves
// its company linking to that page.

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const STEALTH = /^stealth\b/i;

interface Filter {
	filterLabel?: string;
	filterValue?: string;
}

interface Hero {
	status?: string[];
	filters?: { items?: Filter[] };
	ctasCollection?: { items?: { text?: string; url?: string }[] };
	mediaAnnotation?: { city?: string };
}

interface Listed {
	title?: string;
	slug?: string;
	hero?: Hero;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the page's props, out of its data script
function propsOf(html: string): Record<string, unknown> | undefined {
	const json = html.match(NEXT_DATA)?.[1];
	if (!json) return undefined;
	try {
		return (JSON.parse(json) as { props?: { pageProps?: Record<string, unknown> } }).props?.pageProps;
	} catch {
		return undefined;
	}
}

// what a company's page adds — its site and city — or nothing when the
// page will not load
async function detailOf(page: string): Promise<{ site: string; city: string }> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return { site: '', city: '' };
		const hero = (propsOf(await resp.text())?.portfolioBioData as { hero?: Hero } | undefined)?.hero;
		const cta = (hero?.ctasCollection?.items ?? []).find((item) => /website/i.test(item.text ?? '') && item.url);
		// one site is written without its scheme
		return {
			site: clean(cta?.url ?? '').replace(/^(?=[\w-]+(\.[\w-]+)+)/, 'https://'),
			city: tag(hero?.mediaAnnotation?.city ?? '')
		};
	} catch {
		return { site: '', city: '' };
	}
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const props = propsOf(await resp.text());
	const listed = Array.isArray(props?.portfolioList) ? (props.portfolioList as Listed[]) : [];
	if (listed.length === 0) {
		throw new Error('drive: no companies in the portfolio page data');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of listed) {
		const name = clean(entry.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const page = entry.slug ? `${PAGE_URL}/${entry.slug}` : '';
		if (companies.length > 0) await wait(PACE_MS);
		const { site, city } = page ? await detailOf(page) : { site: '', city: '' };
		const statuses = (entry.hero?.status ?? []).map(tag).filter((s) => s && !/^active$/i.test(s));
		const exited = statuses.some((s) => /exit|acquir|ipo|public|merg/i.test(s));
		// a status of plain "Exit" says no more than the tag
		const outcomes = statuses.filter((s) => !/^exit(ed)?$/i.test(s));
		companies.push({
			name,
			category: [
				...(entry.hero?.filters?.items ?? [])
					.filter((f) => /industry/i.test(f.filterLabel ?? ''))
					.map((f) => tag(f.filterValue ?? '')),
				city,
				...outcomes,
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || page || PAGE_URL
		});
	}

	return companies;
}
