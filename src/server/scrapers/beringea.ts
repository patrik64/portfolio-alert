import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.beringea.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over sanity: the portfolio page's "Explore our portfolio" table,
// a row a company linking its site, is drawn from the page's own data,
// which gives each company's name, its sectors ("SaaS", "Healthcare"), the
// fund it was backed from — the U.K. one, the U.S. one or both — and
// whether it is current or exited. the sectors and the fund, as the table
// writes it, are kept as tags, an exit with the Exited tag. the case
// studies above the table are companies the table lists too.

const DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
// the funds as the table writes them
const FUNDS: Record<string, string> = { uk: 'U.K.', us: 'U.S.', uk_us: 'U.K. & U.S.' };
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Investment {
	company?: string;
	link?: string;
	fund?: string;
	status?: string;
	sectors?: { title?: string }[];
}

interface Module {
	_type?: string;
	investments?: Investment[];
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
	const modules: Module[] = data?.props?.pageProps?.data?.page?.content?.main?.modules ?? [];
	const investments = modules.find((m) => m?._type === 'explorePortfolio')?.investments;
	if (!Array.isArray(investments)) {
		throw new Error("beringea: the page's data carries no portfolio table — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const investment of investments) {
		const name = clean(investment?.company ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fund = clean(investment.fund ?? '');
		const site = clean(investment.link ?? '');
		companies.push({
			name,
			category: [
				...(investment.sectors ?? []).map((sector) => tag(sector?.title ?? '')),
				FUNDS[fund.toLowerCase()] ?? tag(fund),
				EXITED.test(clean(investment.status ?? '')) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('beringea: the portfolio table names no companies');
	}

	return companies;
}
