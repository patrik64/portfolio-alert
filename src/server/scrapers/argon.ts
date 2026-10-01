import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.argon.vc';
const PAGE_URL = `${BASE_URL}/companies/`;
const LIST_URL = `${BASE_URL}/page-data/companies/page-data.json`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// gatsby: the companies page is a grid of the companies' logos, each
// linking the company's page on the fund's site, and the page's data, the
// file gatsby loads for it, lists them by name. each company's page has a
// data file of its own, with the company's sector ("Future of Work"),
// kept as a tag, and its site. those files are fetched one at a time, and
// one that will not load leaves its company linking to its page, untagged.
// nothing marks an exit.

interface Named {
	company?: { document?: { uid?: string; data?: { company_name?: { text?: string } } } };
}

interface Detail {
	company_sector?: string;
	company_website?: { url?: string };
}

const STEALTH = /^stealth\b/i;

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the company's sector and site, from its page's data file, or nothing
// when the file will not load; a refusal is waited out once
async function detailOf(uid: string): Promise<Detail> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(`${BASE_URL}/page-data/companies/${encodeURIComponent(uid)}/page-data.json`, {
				headers: { 'User-Agent': UA }
			});
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return {};
			const json = (await resp.json()) as { result?: { data?: { prismicCompany?: { data?: Detail } } } };
			return json.result?.data?.prismicCompany?.data ?? {};
		} catch {
			return {};
		}
	}
	return {};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(LIST_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${LIST_URL}: ${resp.status}`);
	}
	const json = (await resp.json()) as {
		result?: { data?: { allPrismicCompanies?: { edges?: { node?: { data?: { companies?: Named[] } } }[] } } };
	};
	const named = (json.result?.data?.allPrismicCompanies?.edges ?? []).flatMap(({ node }) => node?.data?.companies ?? []);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { company } of named) {
		const uid = company?.document?.uid ?? '';
		const name = (company?.document?.data?.company_name?.text ?? '').replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const page = uid ? `${BASE_URL}/companies/${uid}` : PAGE_URL;
		if (uid) await wait(PACE_MS);
		const detail = uid ? await detailOf(uid) : {};
		const site = (detail.company_website?.url ?? '').trim();
		companies.push({
			name,
			category: tag(detail.company_sector ?? ''),
			url: /^https?:\/\//i.test(site) ? site : page
		});
	}
	if (companies.length === 0) {
		throw new Error('argon: no companies in the page data');
	}

	return companies;
}
