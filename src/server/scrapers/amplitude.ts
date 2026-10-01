import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://amplitudevc.com/en/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// statamic: the portfolio page is drawn by its script from the companies
// handed to it in the page, each with its name, its site, the fund it is in
// ("fund-1"), its categories ("oncology", "ipo"), the year the fund
// partnered with it and whether it is "active" or "exited", beside the
// names the page gives the funds ("Fund I") and the categories
// ("Oncology", "IPO"). the fund, the categories and the year are kept as
// tags; a company marked private is left out.

const FILTER = /<portfolio-filter\b([^>]*)>/;
const PROP = (name: string) => new RegExp(`\\s:${name}="([^"]*)"`);
const STEALTH = /^stealth\b/i;

interface Term {
	slug?: string;
	title?: string;
}

interface Company {
	title?: string;
	website?: string;
	partnership?: string[];
	categories?: string[];
	partnered_year?: string | number | null;
	portfolio_status?: { value?: string } | string | null;
	private?: boolean;
	published?: boolean;
}

// the attribute's json, its entities undone
const decode = (s: string) =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;|&#x27;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const attributes = (await resp.text()).match(FILTER)?.[1] ?? '';
	const prop = <T>(name: string): T[] => {
		const json = attributes.match(PROP(name))?.[1];
		return json ? (JSON.parse(decode(json)) as T[]) : [];
	};
	const records = prop<Company>('portfolios');
	if (records.length === 0) {
		throw new Error('amplitude: no companies handed to the portfolio page');
	}
	const names = (terms: Term[]) => new Map(terms.map(({ slug, title }) => [slug ?? '', tag(title ?? '')]));
	const funds = names(prop<Term>('portfolio-partnerships'));
	const categories = names(prop<Term>('portfolio-categories'));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const name = (record.title ?? '').replace(/\s+/g, ' ').trim();
		if (!name || record.private || record.published === false) continue;
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = typeof record.portfolio_status === 'string' ? record.portfolio_status : record.portfolio_status?.value;
		const year = String(record.partnered_year ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = (record.website ?? '').trim();
		companies.push({
			name,
			category: [
				...(record.partnership ?? []).map((slug) => funds.get(slug) ?? ''),
				...(record.categories ?? []).map((slug) => categories.get(slug) ?? ''),
				year ? `Invested ${year}` : '',
				/^exited$/i.test(status ?? '') ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('amplitude: no companies in the portfolio');
	}

	return companies;
}
