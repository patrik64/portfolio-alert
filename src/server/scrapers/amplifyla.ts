import type { ScrapedCompany } from './types';

const BASE_URL = 'https://amplify.la';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the portfolio page is a grid of the companies'
// logos, each over a line about the company and a "Learn more" button
// linking either the company's site or its page on the fund's site, with
// the company's standing ("active", "exited") and sectors ("consumer",
// "fintech") as classes, which the page's filter names ("Exited",
// "Fintech") and which are kept as tags. no company is named in words on
// the grid, the logos' alt text being loose ("LOGO BITIUM", "Acquired logo
// Clover") or empty, so each company's page on the fund's site, reached by
// its post's id (?p=<id>, which the site sends on to the post's own address,
// a slug for most and the id for some), is fetched one at a time for the
// name its title opens with ("Altitude AI - Amplify"). a page that will not
// load leaves the logo's alt text, cleaned, and a company with neither fails
// the run. an exited logo whose alt text says "Acquired" keeps that as a tag.
//
// in october 2026 the site went dark for three days: the domain pointed at
// wp engine, which answered with its own certificate and "site not
// configured" — a move, the site back on the 19th and slower than before, a
// second and more for each answer, redirects included, which puts the run
// near two minutes from the deployment. a fetch that fails before any
// answer says why, rather than "fetch failed", and the run fails as before.

const ITEM = /<article\b[^>]*\bid="post-(\d+)"[^>]*\bclass="([^"]*\belementor-grid-item\b[^"]*)"[^>]*>([\s\S]*?)<\/article>/g;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
const STATUS = /\bportfolio-status-([\w-]+)/;
const SECTOR = /\bportfolio-tags-([\w-]+)/g;
// the filter's choices, each an input and the label for it
const CHOICE = /<input\b[^>]*\bvalue="([^"]*)"[^>]*\bname="_sft_portfolio-(status|tags)\[\]"[^>]*\bid="([^"]*)"/g;
const LABEL_FOR = (id: string) => new RegExp(`<label\\b[^>]*\\bfor="${id}"[^>]*>([\\s\\S]*?)<\\/label>`);
const TITLE = /<title>([\s\S]*?)<\/title>/;
// "Altitude AI - Amplify | We help passionate technology entrepreneurs …"
const TITLE_NAME = /^(.*?)\s+[-–—]\s+Amplify\b/;
const ALT_NOISE = /\b(?:logo|acquired|white|colou?r)\b|\b\d+\b/gi;
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

// the company's name, from the title of its page on the fund's site, or
// nothing when the page will not load; a refusal is waited out once
async function nameOf(post: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(`${BASE_URL}/?p=${post}`, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			return clean(clean((await resp.text()).match(TITLE)?.[1] ?? '').match(TITLE_NAME)?.[1] ?? '');
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	let resp: Response;
	try {
		resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	} catch (err) {
		// the cause behind node's bare "fetch failed": a certificate for another
		// host, a name that no longer resolves, a connection refused
		const cause = (err as { cause?: { code?: string; message?: string } }).cause;
		const why = [cause?.code, cause?.message ?? (err instanceof Error ? err.message : String(err))]
			.filter(Boolean)
			.join(': ')
			.slice(0, 160);
		throw new Error(`amplifyla: ${PAGE_URL} did not answer — ${why}`);
	}
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// "status:exited" -> "Exited", "tags:fintech" -> "Fintech"
	const labels = new Map<string, string>();
	for (const [, value, taxonomy, id] of html.matchAll(CHOICE)) {
		const label = tag(html.match(LABEL_FOR(id))?.[1] ?? '');
		if (value && label) labels.set(`${taxonomy}:${value}`, label);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, post, classes, body] of html.matchAll(ITEM)) {
		const alt = clean(body.match(ALT)?.[1] ?? '');
		await wait(PACE_MS);
		const name = (await nameOf(post)) || alt.replace(ALT_NOISE, ' ').replace(/\s+/g, ' ').trim();
		if (!name) {
			throw new Error(`amplifyla: no name for the portfolio's post ${post}`);
		}
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = classes.match(STATUS)?.[1] ?? '';
		const exited = /^exited$/i.test(status);
		const link = unescape(body.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...[...classes.matchAll(SECTOR)].map(([, sector]) => labels.get(`tags:${sector}`) ?? ''),
				exited && /\bacquired\b/i.test(alt) ? 'Acquired' : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(link) ? link : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('amplifyla: no companies on the portfolio page');
	}

	return companies;
}
