import type { ScrapedCompany } from './types';

const API = 'https://resolute.cdn.prismic.io/api/v2';
const TYPE = 'company';
const PAGE_SIZE = 100;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over prismic. the companies page ships every company in its flight
// stream, but the same documents come out of prismic's own api as plain json,
// which is what is read here. the master ref changes with every publish, so it
// is asked for first.
//
// the fund records a sector and a place for each company and links to it. five
// companies carry "(acquired by X)" inside the name; that is a circumstance
// rather than the name, so it moves to the category and the company does not
// read as new the day the fund adds it.

const ACQUIRED = /\s*\(\s*acquired by ([^)]+)\)\s*$/i;

interface Ref {
	ref: string;
}
interface Doc {
	data?: {
		company_name?: string;
		sectors?: { sector?: string | null }[] | null;
		locations?: { location?: string | null }[] | null;
		company_website?: { url?: string } | null;
	};
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fetchJson(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const api = (await fetchJson(API)) as { refs?: Ref[] };
	const ref = api.refs?.[0]?.ref;
	if (!ref) {
		throw new Error('resolute: prismic gave no ref to read the documents at');
	}

	const query = encodeURIComponent(`[[at(document.type,"${TYPE}")]]`);
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let page = 1;
	let pages = 1;
	do {
		const body = (await fetchJson(
			`${API}/documents/search?ref=${ref}&q=${query}&pageSize=${PAGE_SIZE}&page=${page}`
		)) as { results?: Doc[]; total_pages?: number };
		pages = body.total_pages ?? 1;
		for (const doc of body.results ?? []) {
			const listed = clean(doc.data?.company_name ?? '');
			const acquirer = listed.match(ACQUIRED)?.[1];
			const name = clean(listed.replace(ACQUIRED, ''));
			if (!name || seen.has(name)) continue;
			seen.add(name);

			companies.push({
				name,
				category: [
					...(doc.data?.sectors ?? []).map((s) => clean(s?.sector ?? '')),
					...(doc.data?.locations ?? []).map((l) => clean(l?.location ?? '')),
					acquirer ? `Acquired by ${clean(acquirer)}` : ''
				]
					.filter(Boolean)
					.join(', '),
				url: doc.data?.company_website?.url ?? ''
			});
		}
		page += 1;
	} while (page <= pages);

	if (companies.length === 0) {
		throw new Error('resolute: no companies in the prismic collection');
	}

	return companies;
}
