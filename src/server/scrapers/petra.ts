import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://petracapital.com/portfolio/';
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of logos, the whole of it in the
// page, a logo a company named in a heading kept for screen readers and
// linking its page here, and classed for the page's filters by its
// industry ("Healthcare", "Technology Enabled Services") and its status
// ("Current", "Former"), which the filters name. a company's page adds the
// year the fund invested; it gives no site, so every company links its
// page here. the industry and the year are kept as tags, a former holding
// with the Exited tag. a company page that will not load, or is not
// reached by the deadline, leaves its company without the year.

const CARD = /<a\b[^>]*class="col-xs-6 col-sm-3"[^>]*href="([^"]*)"[^>]*>\s*<article class="([^"]*)">([\s\S]*?)<\/article>/g;
const NAME = /<h2 class="entry-title[^"]*">([\s\S]*?)<\/h2>/;
const FILTER = /<select\s+name='cat'\s+id='mod-tax-mod_cs_industry'[^>]*>([\s\S]*?)<\/select>/;
const OPTION = /<option class="level-0" value="([^"]+)">([^<]*)</g;
const INDUSTRY = /\bloco_mod_cs_cat_tax-([a-z0-9-]+)/g;
const FORMER = /\bloco_mod_cs_label_tax-former\b/;
const INVESTED = /<h4>Year Invested<\/h4>\s*((?:19|20)\d{2})/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

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

// the year a company's page says the fund invested, or nothing when it will not load
async function investedOf(href: string): Promise<string | undefined> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return undefined;
		}
		return (await resp.text()).match(INVESTED)?.[1];
	} catch {
		return undefined;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	// the industries, by the class each logo is shown under
	const industries = new Map(
		[...(html.match(FILTER)?.[1] ?? '').matchAll(OPTION)].map(([, key, label]) => [key, tag(label)])
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, path, classes, card] of html.matchAll(CARD)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = new URL(unescape(path), PAGE_URL).href;
		const reached = Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const year = reached ? await investedOf(href) : undefined;
		companies.push({
			name,
			category: [
				...[...classes.matchAll(INDUSTRY)].map(([, key]) => industries.get(key) ?? ''),
				year ? `Invested ${year}` : '',
				FORMER.test(classes) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: href
		});
	}

	if (companies.length === 0) {
		throw new Error('petra: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
