import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://defy.vc/companies/';
// the filtered listings and the companies' pages are asked for one at a
// time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page lists every company as
// a row — the name, beside it on one the fund is out of a word on how
// ("Viventium", "IPO: NAUT"), a line about it — linking its page on the
// fund's site. the page can be filtered by industry, sector and location,
// each a listing of its own on the server, so every filter's listing is
// fetched to learn what each company is filed under. a company's page
// spells the exit out ("acquired by Viventium") and links its site first
// among its highlights, so those pages are fetched too; one that will not
// load leaves its company with the row's word, linking to that page.

const OPTION = /<option value="(?:\/companies\/)?\?(industry|sector|location)=([^"#]+)#list"\s*>([^<]*)<\/option>/g;
const ROW = /(?=<div class="company_row\b)/;
const PAGE = /<a\b[^>]*\bhref="(https:\/\/defy\.vc\/company\/[^"]+)"/;
const TITLE = /class="company_title"[^>]*>([\s\S]*?)<\/div>/;
const EXIT = /<(span|div) class="exit_text"[^>]*>([\s\S]*?)<\/\1>/;
// the same words also tell of a company's own purchases ("acquired
// OfficeTogether"); only being bought, or listed, is an exit
const EXITED = /\b(?:acquired by|ipo|merged|exited)\b/i;
// a company's page opens with its name and exit; a list of the others,
// with theirs, follows further down
const DETAIL = /class="post_col post_col1\b[^"]*"[^>]*>([\s\S]*?)<!-- end \.post_col -->/;
const HIGHLIGHT = /class="highlight_text"[^>]*>\s*<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page's text, or nothing when it will not load
async function pageOf(url: string): Promise<string> {
	try {
		let resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(url, { headers: { 'User-Agent': UA } });
		}
		return resp.ok ? await resp.text() : '';
	} catch {
		return '';
	}
}

// how an exit is written, capitalised: "acquired by Viventium"
const outcomeOf = (text: string) => {
	const t = tag(text);
	return t ? t[0].toUpperCase() + t.slice(1) : '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	interface Row {
		name: string;
		page: string;
		exit: string;
	}
	const rows: Row[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const title = row.match(TITLE)?.[1] ?? '';
		const exit = clean(title.match(EXIT)?.[2] ?? '');
		const name = clean(title.replace(EXIT, ' '));
		const page = unescape(row.match(PAGE)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		rows.push({ name, page, exit });
	}
	if (rows.length === 0) {
		throw new Error('defy: no companies on the companies page');
	}

	// what each company is filed under, learnt from the filtered listings
	const filed = new Map<string, string[]>();
	const filters = [...html.matchAll(OPTION)].map(([, param, slug, label]) => ({ param, slug, label: tag(label) }));
	for (const { param, slug, label } of filters) {
		await wait(PACE_MS);
		const listing = await pageOf(`${PAGE_URL}?${param}=${slug}`);
		// the featured companies head every listing; only the rows are filtered
		for (const row of listing.split(ROW).slice(1)) {
			const page = unescape(row.match(PAGE)?.[1] ?? '');
			if (page) filed.set(page, [...(filed.get(page) ?? []), label]);
		}
	}

	const companies: ScrapedCompany[] = [];
	for (const row of rows) {
		await wait(PACE_MS);
		const page = row.page ? await pageOf(row.page) : '';
		const site = unescape(page.match(HIGHLIGHT)?.[1] ?? '');
		const outcome = outcomeOf((page.match(DETAIL)?.[1] ?? '').match(EXIT)?.[2] ?? '') || outcomeOf(row.exit);
		const exited = EXITED.test(outcome);
		companies.push({
			name: row.name,
			category: [...(filed.get(row.page) ?? []), outcome, exited ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || row.page || PAGE_URL
		});
	}

	return companies;
}
