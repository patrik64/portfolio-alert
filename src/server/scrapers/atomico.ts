import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://careers.atomico.com/companies';
const API_URL = 'https://api.getro.com/api/v2';
const PACE_MS = 150;
const MAX_PAGES = 50;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// getro: atomico.com itself is behind a browser challenge, but the fund's
// careers board, run by getro, lists its portfolio companies on a page of
// their own. the page names the board's network and draws a dozen
// companies; the rest come from getro's search, a dozen at a time, which is
// asked here the way the page asks it. a company comes with its site, the
// tags the board shows ("Artificial Intelligence (AI)", "Fintech") and its
// stage as getro has it ("Series B", "Acquired", "IPO"), kept as tags; the
// board does not say which the fund has exited.

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const STAGES: Record<string, string> = {
	pre_seed: 'Pre-seed',
	seed: 'Seed',
	private_equity: 'Private Equity',
	acquisition: 'Acquired',
	ipo: 'IPO'
};
const UNSAID = /^(?:other|series_unknown|undisclosed|unknown)$/i;
const STEALTH = /^stealth\b/i;

interface Company {
	name?: string;
	domain?: string;
	stage?: string;
	visible_industry_tags?: string[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "series_b" -> "Series B"
const stageOf = (stage: string) =>
	UNSAID.test(stage)
		? ''
		: (STAGES[stage] ?? stage.replace(/^series_([a-z])$/, (_, letter: string) => `Series ${letter.toUpperCase()}`));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const data = (await resp.text()).match(NEXT_DATA)?.[1];
	const network = data ? (JSON.parse(data)?.props?.pageProps?.network?.id as string | number | undefined) : undefined;
	if (!network) {
		throw new Error("atomico: the careers page names no network — getro's page moved");
	}

	const found: Company[] = [];
	let count = Infinity;
	for (let page = 0; page < MAX_PAGES && found.length < count; page++) {
		if (page > 0) await wait(PACE_MS);
		const answer = await fetch(`${API_URL}/collections/${network}/search/companies`, {
			method: 'POST',
			headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ hitsPerPage: 12, page, query: '', filters: '' })
		});
		if (!answer.ok) {
			throw new Error(`atomico: getro's company search answered ${answer.status} on page ${page}`);
		}
		const { results } = (await answer.json()) as { results?: { companies?: Company[]; count?: number } };
		const companies = results?.companies ?? [];
		count = results?.count ?? 0;
		if (companies.length === 0) break;
		found.push(...companies);
	}
	// a part of the list must not pass for the whole
	if (found.length === 0 || found.length < count) {
		throw new Error(`atomico: getro's search gave ${found.length} of the ${count} companies it counts`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of found) {
		const name = clean(company.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const domain = clean(company.domain ?? '');
		companies.push({
			name,
			category: [...(company.visible_industry_tags ?? []).map(tag), stageOf(clean(company.stage ?? ''))]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: domain ? `https://${domain.replace(/^https?:\/\//, '')}` : PAGE_URL
		});
	}

	return companies;
}
