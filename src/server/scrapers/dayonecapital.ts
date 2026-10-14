import type { ScrapedCompany } from './types';

const BASE_URL = 'https://dayonecapital.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the portfolio the site draws, as its script asks for it
const DATA_URL = `${BASE_URL}/data/portfolio.json`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a single-page app: the site draws its portfolio in the browser from a
// list it serves, the whole of it at once, its companies held and exited,
// each with its name, its industry ("Robotics & Automation", "Mobility,
// AI"), where it is ("Hungary, Netherlands"), the year the fund invested,
// its site and, for an exit, how it went and to whom ("Acquisition",
// "Hydda"); the list also groups the companies by the fund that holds them
// ("Fund II"). a name can carry its buyer ("Gamee/Animoca Brands"), which
// is moved out of it. the industry, the place, the fund and the year are
// kept as tags, an exit with the Exited tag and its buyer or listing; a
// company without a site links its panel on the site.

const EXITED = /^exited$/i;
const IPO = /^ipo$/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Company {
	slug?: string;
	name?: string;
	industry?: string | null;
	year?: number | string | null;
	website?: string | null;
	location?: string | null;
	status?: string | null;
	exitType?: string | null;
	acquirer?: string | null;
}

interface Data {
	active?: Company[];
	exited?: Company[];
	fundGroups?: { name?: string; slugs?: string[] }[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(DATA_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	const data: Data = await resp.json();
	const all = [...(data.active ?? []), ...(data.exited ?? [])];
	if (all.length === 0) {
		throw new Error("dayonecapital: the site's list carries no portfolio — the data moved");
	}
	// the fund that holds each company, by its slug
	const funds = new Map(
		(data.fundGroups ?? []).flatMap((group) => (group.slugs ?? []).map((slug) => [slug, clean(group.name ?? '')]))
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of all) {
		const buyer = clean(company?.acquirer ?? '');
		// "Gamee/Animoca Brands" -> "Gamee", the buyer kept as a tag
		const written = clean(company?.name ?? '');
		const name = buyer
			? written.replace(new RegExp(`\\s*/\\s*${escaped(buyer)}$`, 'i'), '') || written
			: written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exited = EXITED.test(clean(company.status ?? ''));
		const year = String(company.year ?? '').match(YEAR)?.[0];
		const site = clean(company.website ?? '');
		const slug = clean(company.slug ?? '');
		companies.push({
			name,
			category: [
				...clean(company.industry ?? '').split(',').map(tag),
				...clean(company.location ?? '').split(/[,/]/).map(tag),
				tag(funds.get(slug) ?? ''),
				year ? `Invested ${year}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : IPO.test(clean(company.exitType ?? '')) ? 'IPO' : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : slug ? `${PAGE_URL}/${encodeURIComponent(slug)}` : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('dayonecapital: the portfolio names no companies');
	}

	return companies;
}
