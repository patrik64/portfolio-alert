import type { ScrapedCompany } from './types';

const BASE_URL = 'https://emerging.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over contentful: the portfolio page carries its data in the
// __NEXT_DATA__ script, the companies grouped by the fund that invested
// ("Fund 2") and a record for each — the name, a location, its tags ("Ad
// Tech") and a status, active or exited — but not its site, which only the
// company's own page carries, in the same script. so those pages are
// fetched for the sites; one that will not load leaves its company linking
// to that page.

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const STEALTH = /^stealth\b/i;

interface Company {
	name?: string;
	slug?: string;
	location?: string;
	fund?: string;
	tags?: string[];
	status?: string;
	url?: string;
}

interface Group {
	fund?: string;
	companies?: Company[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// the site a company's page gives, or nothing when the page will not load
async function siteOf(page: string): Promise<string> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return '';
		const url = propsOf(await resp.text())?.url;
		return typeof url === 'string' ? url.trim() : '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const props = propsOf(await resp.text());
	const groups = Array.isArray(props?.companies) ? (props.companies as Group[]) : [];
	const records = groups.flatMap((group) =>
		(group.companies ?? []).map((company) => ({ fund: group.fund, ...company }))
	);
	if (records.length === 0) {
		throw new Error('emerging: no companies in the portfolio page data');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const name = clean(record.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const page = record.slug ? `${PAGE_URL}/${record.slug}` : '';
		if (companies.length > 0) await wait(PACE_MS);
		const site = page ? await siteOf(page) : '';
		companies.push({
			name,
			category: [
				...(record.tags ?? []).map(tag),
				tag(record.location ?? ''),
				tag(record.fund ?? ''),
				record.status?.toLowerCase() === 'exited' ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || page || PAGE_URL
		});
	}

	return companies;
}
