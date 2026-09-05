import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.phoenixcourt.vc';
const LIST_URL = `${BASE_URL}/api/v1/listings/companies`;
// localglobe is one of the phoenix court group's funds, and the group's site
// files every company under all of them — this filter keeps the fund the
// registry names
const FUND = 'localglobe';
const BATCH_SIZE = 20;

// the site draws its companies page from a json listing api (a dozen per
// page) and each company's popup from a details api; both are open. the
// listing carries the name and a status, the details the company's own
// address, its sectors and its cities. "Live" is the default status and says
// nothing; "Acquired" and "Publicly listed" are kept, and an acquisition is
// what counts as the fund being out.

interface ListedCompany {
	node?: { title?: string; url?: string; companyStatus?: string };
}

interface DetailPage {
	websiteUrl?: string;
	categories?: { edges?: { node?: { label?: string } }[] };
	locations?: { edges?: { node?: { label?: string } }[] };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
// tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchJson<T>(url: string): Promise<T> {
	const resp = await fetch(url);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json() as Promise<T>;
}

const listPage = (page: number) =>
	fetchJson<{ items?: ListedCompany[]; totalPages?: number }>(
		`${LIST_URL}?page=${page}&funds=${FUND}`
	);

export async function scrape(): Promise<ScrapedCompany[]> {
	const first = await listPage(1);
	const more = await Promise.all(
		Array.from({ length: Math.max(0, (first.totalPages ?? 1) - 1) }, (_, i) => listPage(i + 2))
	);
	const nodes = [first, ...more]
		.flatMap((d) => d.items ?? [])
		.map((c) => c.node)
		.filter((n): n is NonNullable<typeof n> => Boolean(n?.title && n.url));
	if (nodes.length === 0) {
		throw new Error('localglobe: the listing api returned no companies');
	}

	const details = new Map<string, DetailPage>();
	for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
		await Promise.all(
			nodes.slice(i, i + BATCH_SIZE).map(async (node) => {
				try {
					const { page } = await fetchJson<{ page?: DetailPage }>(
						`${BASE_URL}/api/v1/details${node.url}`
					);
					if (page) details.set(node.url!, page);
				} catch {
					// the listing already names the company; it just goes without
					// sectors and its own address
				}
			})
		);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const node of nodes) {
		const name = clean(node.title!);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const detail = details.get(node.url!) ?? {};
		const status = clean(node.companyStatus ?? '');
		companies.push({
			name,
			category: [
				...(detail.categories?.edges ?? []).map((e) => tag(e.node?.label ?? '')),
				...(detail.locations?.edges ?? []).map((e) => tag(e.node?.label ?? '')),
				/^live$/i.test(status) ? '' : tag(status),
				/acquired/i.test(status) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: detail.websiteUrl || `${BASE_URL}/${FUND}${node.url}`
		});
	}

	return companies;
}
