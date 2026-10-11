import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.fortino.vc';
const PAGE_URL = `${BASE_URL}/our-portfolio`;
const CONTENT_URL = `${BASE_URL}/api/content`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a react app: the portfolio page draws every company from the site's own
// content endpoint, which gives each one's name, its site, its sector
// ("Cybersecurity", "Construction software"), the categories the page sorts
// by ("enterprise-tech", shown as "Enterprise Tech"), where it is ("Ghent,
// Belgium", a street address or just "Europe"), the year it was founded,
// when the fund invested ("March 2024", "Entry Jan 25 (Fortino VC II), ...")
// and whether the fund is out of it. the sector, the categories, the
// country, the founding year and the year invested are kept as tags, an
// exit with the Exited tag.

// the page's names for the categories
const CATEGORIES: Record<string, string> = {
	'sme-tech': 'SME Tech',
	'enterprise-tech': 'Enterprise Tech',
	robotics: 'Robotics',
	cyber: 'Cyber'
};
// the page's own test for an exit, where the record does not say outright
const EXITED = /exited|passive|past/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
// "Jan 25" -> 2025
const SHORT_YEAR = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{2})\b/i;
// "Europe" is where every one of them is, so says nothing of the company
const UNSAID = /^(?:-|other|others|all|n\/a|europe)$/i;
const STEALTH = /^stealth\b/i;

interface Company {
	name?: string;
	website?: string;
	sector?: string;
	categories?: string[];
	location?: string;
	founded?: string;
	investmentDate?: string;
	exited?: boolean;
	stage?: string;
	portfolioStatus?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const yearOf = (s: string | undefined) => {
	const text = s ?? '';
	const short = text.match(SHORT_YEAR)?.[1];
	return text.match(YEAR)?.[0] ?? (short ? `20${short}` : undefined);
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(CONTENT_URL, {
		headers: { 'User-Agent': UA, Accept: 'application/json', Referer: PAGE_URL }
	});
	if (!resp.ok) {
		throw new Error(`fortino: the site's content endpoint answered ${resp.status}`);
	}
	const data = (await resp.json()) as { companies?: Company[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of data.companies ?? []) {
		const name = clean(company.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const out =
			typeof company.exited === 'boolean'
				? company.exited
				: EXITED.test(`${company.stage ?? ''} ${company.portfolioStatus ?? ''}`);
		// the country, the last part of a place or an address
		const country = clean(company.location ?? '').split(',').pop() ?? '';
		const founded = yearOf(company.founded);
		const invested = yearOf(company.investmentDate);
		const site = clean(company.website ?? '');
		companies.push({
			name,
			category: [
				tag(company.sector ?? ''),
				...(company.categories ?? []).map((id) => tag(CATEGORIES[id] ?? id.replace(/-/g, ' '))),
				tag(country),
				founded ? `Founded ${founded}` : '',
				invested ? `Invested ${invested}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error("fortino: the site's content endpoint gave no companies");
	}

	return companies;
}
