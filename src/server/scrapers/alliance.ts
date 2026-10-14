import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://alliance.vc/portfolio/';
// gatsby keeps each page's data beside it, the page drawn from it
const DATA_URL = 'https://alliance.vc/page-data/portfolio/page-data.json';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// gatsby over sanity: the portfolio page is a grid of logos, a logo a
// company linking its site, with a badge on one the fund is out of —
// "Acquired by Visma", or "IPO" — read from the page's own data, which
// gives each company's name, its link, its status ("active", "exited")
// and who bought it. a buyer is kept as "Acquired by …", a listing as IPO,
// and any exit with the Exited tag; the page files nobody under a sector.
// a sold company's logo links its buyer, as the page has it.

const EXITED = /^exited$/i;
const IPO = /\bipo\b/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Investment {
	company?: string;
	link?: string | null;
	status?: string | null;
	aquiredByCompany?: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(DATA_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	const data = (await resp.json()) as { result?: { data?: { sanityInvestments?: { investments?: Investment[] } } } };
	const investments = data.result?.data?.sanityInvestments?.investments;
	if (!Array.isArray(investments)) {
		throw new Error("alliance: the page's data carries no investments — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const investment of investments) {
		const name = clean(investment?.company ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const out = clean(investment.aquiredByCompany ?? '');
		const listed = IPO.test(out);
		const site = clean(investment.link ?? '');
		companies.push({
			name,
			category: [
				out && !listed ? `Acquired by ${tag(out)}` : '',
				listed ? 'IPO' : '',
				EXITED.test(clean(investment.status ?? '')) || out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('alliance: the portfolio names no companies');
	}

	return companies;
}
