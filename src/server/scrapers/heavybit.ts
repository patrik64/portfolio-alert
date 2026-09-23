import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.heavybit.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the site's content lives in sanity, in a dataset open to anyone to read;
// the page draws its cards from the same documents this asks for
const QUERY_URL = 'https://50q6fr1p.apicdn.sanity.io/v2021-10-21/data/query/production';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the portfolio page shows a card per company, but a named company's card is
// only its logo, with no alt text, so the names come from the documents
// behind the cards: a company is an organization marked as a portfolio
// company, with its name, its site, the stage it joined at, the date it
// joined, the fund's tags for it and how it stands — active, acquired,
// exited, ipo, or stealth. a stealth company's card reads only "stealth":
// the fund keeps it undisclosed, so it is left out here rather than named.
const QUERY = `*[_type == "organization" && portfolioCompany == true && status != "stealth"]{
	name, link, stage, status, joined, "slug": slug.current,
	"tags": tags[]->{ "label": coalesce(title, name) }.label
}`;

interface Company {
	name?: string;
	link?: string | null;
	stage?: string | null;
	status?: string | null;
	joined?: string | null;
	slug?: string | null;
	tags?: (string | null)[] | null;
}

const EXITS: Record<string, string> = { acquired: 'Acquired', exited: '', ipo: 'IPO' };

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "series A" -> "Series A", "pre-seed" -> "Pre-Seed"
const stage = (s: string) => clean(s).replace(/(^|[\s-])([a-z])/g, (_, gap, letter) => gap + letter.toUpperCase());

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(`${QUERY_URL}?query=${encodeURIComponent(QUERY)}`, {
		headers: { 'User-Agent': UA }
	});
	if (!resp.ok) {
		throw new Error(`Failed to query the cms behind ${PAGE_URL}: ${resp.status}`);
	}
	const { result } = (await resp.json()) as { result?: Company[] };
	if (!Array.isArray(result)) {
		throw new Error('heavybit: the cms answered without a result list');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of result) {
		const name = clean(company.name ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = (company.status ?? '').toLowerCase();
		const year = (company.joined ?? '').match(/^(\d{4})-/)?.[1];
		companies.push({
			name,
			category: [
				...(company.tags ?? []).map((t) => tag(t ?? '')),
				company.stage ? stage(company.stage) : '',
				year ? `Joined ${year}` : '',
				EXITS[status] ?? '',
				status in EXITS ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: clean(company.link ?? '') || (company.slug ? `${PAGE_URL}/${company.slug}` : '')
		});
	}

	if (companies.length === 0) {
		throw new Error('heavybit: the cms lists no disclosed portfolio companies');
	}

	return companies;
}
