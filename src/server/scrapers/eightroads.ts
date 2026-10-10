import type { ScrapedCompany } from './types';

const BASE_URL = 'https://eightroads.com';
const PAGE_URL = `${BASE_URL}/en/companies`;
// the api the page draws its grid from, three dozen at a time; asked here
// for as many as it will give, and followed to its next page if there is one
const API_URL = `${BASE_URL}/api/companies?page=1&limit=500&language=en`;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// angular, rendered on the server: the companies page draws a grid from the
// site's own api, every company with a line about it, its sectors ("Med
// Tech", "Enterprise"), the date the fund invested, its site and whether the
// fund has exited it — which the line also says on many ("… (Exited)"),
// sometimes where the flag does not, so either is taken. the sectors and the
// year are kept as tags.

const EXITED_NOTE = /\(exited\)/i;
const STEALTH = /^stealth\b/i;

interface Company {
	name?: string;
	description?: string;
	website?: string;
	investmentStartDate?: string;
	exited?: boolean;
	sectors?: { label?: string }[];
}

interface Answer {
	total?: number;
	items?: Company[];
	_pagination?: { next?: string | null };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const found: Company[] = [];
	let total = 0;
	let url: string | null | undefined = API_URL;
	for (let page = 0; url && page < MAX_PAGES; page++) {
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (!resp.ok) {
			throw new Error(`eightroads: the companies api answered ${resp.status}`);
		}
		const answer = (await resp.json()) as Answer;
		total = answer.total ?? 0;
		found.push(...(answer.items ?? []));
		url = answer._pagination?.next;
	}
	// a part of the list must not pass for the whole
	if (found.length === 0 || found.length < total) {
		throw new Error(`eightroads: the api gave ${found.length} of the ${total} companies it counts`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of found) {
		const name = clean(company.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = company.investmentStartDate?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const out = company.exited === true || EXITED_NOTE.test(company.description ?? '');
		const site = clean(company.website ?? '');
		companies.push({
			name,
			category: [
				...(company.sectors ?? []).map((s) => tag(s.label ?? '')),
				year ? `Invested ${year}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : site ? `https://${site}` : PAGE_URL
		});
	}

	return companies;
}
