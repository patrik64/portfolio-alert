import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.smok.vc/portfolio/';
// the portfolio the page draws, as the page asks its site for it
const DATA_URL = 'https://www.smok.vc/wp-content/themes/smok/api-portfolio.php';
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with vue: the portfolio page draws its grid in the browser from
// a list its theme serves, the whole of it at once, a company each with its
// name, a line about it, its tags ("AI agents", "fintech") and its page
// here, which links its site ("View Website"). the tags are kept as they
// are; the fund does not say which companies it is out of. a company page
// that will not load, or is not reached by the deadline, leaves its company
// linking it.

const SITE = /<a href="([^"]*)"[^>]*>\s*View Website\s*<\/a>/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Item {
	title?: string;
	slug?: string;
	tags?: { name?: string }[] | null;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const headers = { 'User-Agent': UA };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

// a company page's site, or nothing when it will not load
async function siteOf(href: string): Promise<string> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return '';
		}
		const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
		return /^https?:\/\//i.test(site) ? site : '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(DATA_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	const data = JSON.parse(await resp.text());
	const items: Item[] = data?.portfolios ?? [];
	if (items.length === 0) {
		throw new Error("smok: the theme's list carries no portfolio — the endpoint moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const item of items) {
		const name = clean(item?.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = clean(item.slug ?? '');
		const reached = /^https?:\/\//i.test(href) && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		companies.push({
			name,
			category: (item.tags ?? [])
				.map((t) => tag(t?.name ?? ''))
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || (/^https?:\/\//i.test(href) ? href : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('smok: the portfolio names no companies');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("smok: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
