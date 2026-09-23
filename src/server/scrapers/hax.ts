import type { ScrapedCompany } from './types';

const BASE_URL = 'https://hax.co';
const API = `${BASE_URL}/wp-json/wp/v2`;
const PER_PAGE = 100;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on wp engine. the startups page lists the companies a dozen at a
// time through facetwp; the rest api's company type holds all of them, a
// hundred to a request, each with its site among its custom fields and the
// fund's terms for it — its categories, the stage it is at ("Exit" for the
// ones the fund is out of) and the hax cohort it went through. the terms come
// as ids, spelled out by their own endpoints.

interface Company {
	title?: { rendered?: string };
	link?: string;
	acf?: { website?: string | null } | [];
	tx_category?: number[];
	tx_stage?: number[];
	tx_cohort?: number[];
}

interface Term {
	id: number;
	name?: string;
}

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

async function fetchJson<T>(url: string): Promise<{ data: T; resp: Response }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return { data: (await resp.json()) as T, resp };
}

async function terms(taxonomy: string): Promise<Map<number, string>> {
	const { data } = await fetchJson<Term[]>(`${API}/${taxonomy}?per_page=100&_fields=id,name`);
	return new Map(data.map((term) => [term.id, tag(term.name ?? '')]));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [categories, stages, cohorts] = await Promise.all([
		terms('tx_category'),
		terms('tx_stage'),
		terms('tx_cohort')
	]);

	const listed: Company[] = [];
	let total = 0;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const { data, resp } = await fetchJson<Company[]>(
			`${API}/company?per_page=${PER_PAGE}&page=${page}&_fields=title,link,acf,tx_category,tx_stage,tx_cohort`
		);
		total = Number(resp.headers.get('x-wp-total')) || total;
		listed.push(...data);
		if (page >= (Number(resp.headers.get('x-wp-totalpages')) || 1)) break;
	}
	if (total > 0 && listed.length < total) {
		throw new Error(`hax: read ${listed.length} of the ${total} companies listed`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of listed) {
		const name = clean(company.title?.rendered ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const stage = (company.tx_stage ?? []).map((id) => stages.get(id) ?? '').filter(Boolean);
		const exited = stage.some((s) => /^exit/i.test(s));
		const website = Array.isArray(company.acf) ? '' : clean(company.acf?.website ?? '');
		companies.push({
			name,
			category: [
				...(company.tx_category ?? []).map((id) => categories.get(id) ?? ''),
				...stage.filter((s) => !/^exit/i.test(s)),
				...(company.tx_cohort ?? []).map((id) => cohorts.get(id) ?? ''),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: website || company.link || ''
		});
	}

	if (companies.length === 0) {
		throw new Error('hax: the rest api lists no companies');
	}

	return companies;
}
