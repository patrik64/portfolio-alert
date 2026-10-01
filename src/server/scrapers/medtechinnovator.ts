import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://medtechinnovator.org/portfolio-2/';
const SHOWCASE_URL = 'https://pro.innovator.org/showcase';
const DATA_URL = 'https://innovator.org/public/airtable/showcase';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page holds no companies, only a frame showing a
// showcase of the accelerator's innovator portal ("mti-portfolio"), which
// loads every company it holds from a public json route of the portal's,
// read here: each company's name, its site, the year of the cohort it went
// through, kept as "Cohort 2023" — or as the program's name and year when
// the cohort was another of the accelerator's ("APAC Accelerator 2019",
// "U.S. Market Access 2026"), a company that went through twice keeping
// both — and its status, "Acquired" or "IPO" the way out, "Active" left
// out. the clinical, device, digital and diagnostic categories the page
// filters by are left out too: a company ticks as many as it likes, some
// forty. a company with no site links its card in the showcase. the run
// fails when the route sends as many companies as the showcase is set to
// ask for, as the list may have been cut short.

const SHOWCASE = /<iframe\b[^>]*\bsrc="https:\/\/pro\.innovator\.org\/showcase\/([\w-]+)/;
// "2023 - MTI Accelerator"
const PROGRAM = /^(\d{4})\s*-\s*(.+)$/;
const ACCELERATOR = /^mti accelerator$/i;
const OUT = /^(?:acquired|ipo|merged|public|exited)\b/i;
const ACTIVE = /^active$/i;
const STEALTH = /^stealth\b/i;

interface Showcase {
	config?: { mysql?: { limit?: number } | null };
	records?: {
		id?: string | number;
		name?: string;
		website?: string;
		status?: string | string[];
		programYears?: string[];
		cohortMembership?: string[];
	}[];
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const list = (value: unknown) =>
	(Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === 'string');

export async function scrape(): Promise<ScrapedCompany[]> {
	const pageResp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!pageResp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${pageResp.status}`);
	}
	const slug = (await pageResp.text()).match(SHOWCASE)?.[1];
	if (!slug) {
		throw new Error('medtechinnovator: no showcase framed on the portfolio page');
	}

	const dataUrl = `${DATA_URL}/${encodeURIComponent(slug)}`;
	const resp = await fetch(dataUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${dataUrl}: ${resp.status}`);
	}
	const showcase = (await resp.json()) as Showcase;
	const records = Array.isArray(showcase.records) ? showcase.records : [];
	const limit = showcase.config?.mysql?.limit;
	if (typeof limit === 'number' && records.length >= limit) {
		throw new Error(`medtechinnovator: the showcase sent ${records.length} companies, as many as it asks for`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const name = clean(record.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the cohorts, by year; the accelerator's own by year alone
		const cohorts = new Map<string, string>();
		for (const program of list(record.programYears)) {
			const [, year, called] = clean(program).match(PROGRAM) ?? [];
			if (year) cohorts.set(ACCELERATOR.test(called) ? `Cohort ${year}` : `${tag(called)} ${year}`, year);
		}
		if (cohorts.size === 0) {
			for (const year of list(record.cohortMembership)) {
				if (/^\d{4}$/.test(year)) cohorts.set(`Cohort ${year}`, year);
			}
		}
		const statuses = list(record.status).map(tag).filter((s) => s && !ACTIVE.test(s));
		const out = statuses.some((s) => OUT.test(s));
		const site = clean(record.website ?? '');
		companies.push({
			name,
			category: [
				...[...cohorts].sort(([, a], [, b]) => a.localeCompare(b)).map(([cohort]) => cohort),
				...statuses,
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site)
				? site
				: /^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/.test(site)
					? `https://${site}`
					: record.id != null
						? `${SHOWCASE_URL}/${slug}?record=${encodeURIComponent(String(record.id))}`
						: PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('medtechinnovator: no companies in the showcase');
	}

	return companies;
}
