import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://alstin.capital/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over strapi: the portfolio page's grid of founders and logos is
// drawn from the page's own data, a company each with its name, its site,
// the year the fund invested, its country and whether the fund has exited
// it. the country and the year are kept as tags, an exit with the Exited
// tag; an entry marked as a draft is not on the page and is left out.

const DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const SECTION = 'blocks.founder-section';
const YEAR = /\b(?:19|20)\d{2}\b/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Founder {
	name?: string;
	website?: string | null;
	yearOfInvestment?: string | number | null;
	country?: string | null;
	exit?: boolean | null;
	draft?: boolean | null;
}

interface Block {
	__component?: string;
	founder?: Founder[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const data = JSON.parse(html.match(DATA)?.[1] ?? 'null');
	const blocks: Block[] = data?.props?.pageProps?.pageData?.attributes?.blocks ?? [];
	const founders = blocks.filter((b) => b?.__component === SECTION).flatMap((b) => b.founder ?? []);
	if (founders.length === 0) {
		throw new Error("alstin: the page's data carries no portfolio — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const founder of founders) {
		const name = clean(founder?.name ?? '');
		if (!name || founder.draft || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = String(founder.yearOfInvestment ?? '').match(YEAR)?.[0];
		const site = clean(founder.website ?? '');
		companies.push({
			name,
			category: [tag(founder.country ?? ''), year ? `Invested ${year}` : '', founder.exit ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('alstin: the portfolio names no companies');
	}

	return companies;
}
