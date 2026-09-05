import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.neotribe.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the page is a react app that ships no content at all — five kilobytes of
// bootstrap — and fills itself from prismic. it says so in its own config,
// which names the repository and carries the read token the browser uses, so
// both are taken from there rather than written down here: the fund can rotate
// the token and this follows it to the next one.
//
// the cms holds three kinds of company document. current is the portfolio, and
// it is the only kind the page shows — sixty-two cards against sixty-two
// documents. historical is the fund's older investments, which it keeps but
// does not publish here. hidden is the ones it has taken down, and among them
// are stale second copies of three companies it still holds, so a scraper that
// took everything would list Hakimo, Aquarius Energy and Ubyon twice over and
// announce nineteen companies the page does not show. only current is read.
//
// the cms is more careful about an ending than the page is: it separates a
// company that was bought from one that listed, where the cards collapse the
// first to EXITED and the second to PUBLIC. the cms wording is kept, since it
// is the fund's own and says the more of the two.
//
// a card also carries the round and year of each investment and, for eight
// companies, an IGNITE FUND badge. the rounds are the shape of the investment
// rather than the company, and Ignite is one of the fund's own vehicles, so
// neither is written down.

const API_URL = (repo: string) => `https://${repo}.cdn.prismic.io/api/v2`;
const CONFIG = /"prismicRepo":\s*("(?:[^"\\]|\\.)*")/;
const TOKEN = /"prismicAccessToken":\s*("(?:[^"\\]|\\.)*")/;
// the only kind of company document the portfolio page shows
const PUBLISHED = 'current';

interface Doc {
	data?: {
		company_name?: { text?: string }[];
		industry?: string | null;
		second_industry?: string | null;
		company_status?: string | null;
		status?: string | null;
		company_link?: { url?: string };
	};
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fetchJson<T>(url: string): Promise<T> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return (await resp.json()) as T;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const repo = html.match(CONFIG)?.[1];
	const token = html.match(TOKEN)?.[1];
	if (!repo || !token) {
		throw new Error('neotribe: the page no longer says where its content comes from');
	}
	// the config is javascript, so the two are read the way the browser reads them
	const api = API_URL(JSON.parse(repo) as string);
	const access = encodeURIComponent(JSON.parse(token) as string);

	const master = (await fetchJson<{ refs: { isMasterRef?: boolean; ref: string }[] }>(
		`${api}?access_token=${access}`
	)).refs.find((ref) => ref.isMasterRef)?.ref;
	if (!master) {
		throw new Error('neotribe: the cms lists no master ref');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let page = 1, pages = 1; page <= pages; page++) {
		const query = new URLSearchParams({
			ref: master,
			q: '[[at(document.type,"company")]]',
			pageSize: '100',
			page: String(page),
			access_token: JSON.parse(token) as string
		});
		const found = await fetchJson<{ total_pages: number; results: Doc[] }>(
			`${api}/documents/search?${query}`
		);
		pages = found.total_pages;

		for (const doc of found.results) {
			const data = doc.data ?? {};
			if (data.status !== PUBLISHED) continue;

			const name = clean((data.company_name ?? []).map((line) => line.text ?? '').join(' '));
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			companies.push({
				name,
				category: [data.industry, data.second_industry, data.company_status]
					.map((label) => clean(label ?? ''))
					.filter(Boolean)
					.join(', '),
				url: data.company_link?.url ?? ''
			});
		}
	}

	if (companies.length === 0) {
		throw new Error(`neotribe: no ${PUBLISHED} companies in the cms`);
	}

	return companies;
}
