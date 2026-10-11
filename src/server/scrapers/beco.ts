import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.becocapital.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
// the site sits on wordpress.com's own hosting, which from 10 October 2026
// answers an address with a 429 after about seven requests in a row, and
// then lets through one every half minute or so for minutes after — the
// nightly run, leaving vercel by addresses others share, as much as any.
// every request waits a second after the last, a refusal is waited out
// twice, longer the second time, and nothing is waited for past the
// deadline, which leaves the rest of the run its time.
const PACE_MS = 1_000;
const REFUSED_MS = [30_000, 60_000];
const DEADLINE_MS = 180_000;
// a refused address is sometimes left hanging rather than answered, which
// node would wait five minutes on, so a request is given this long
const TIMEOUT_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the portfolio page is empty until its script
// draws the wall through admin-ajax, a logo a company, named in its alt
// text and linking the company's page on the fund's site. the wall is
// asked for the way the script asks ("load_filtered_portfolio"), all of it
// and then through its tabs: the stage ("Early Stage", "Growth Stage") or
// "Exits", and the sector ("FinTech", "PropTech"). the whole wall decides
// who is listed, and one that will not come fails the run; the tabs only
// sort it, so once the site will not give one the rest are let go, the
// companies keeping the tags already found — "Exits" is asked first. a
// company's own site is the "Visit … Website" link on its page; those pages
// are fetched one at a time, and a page that will not load leaves its
// company linking to it — as do the rest, once the site refuses one or the
// deadline passes.

const TAB = /<li\b[^>]*\bclass="portfoliotab[^"]*"[^>]*\bdata-cat="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g;
const TIER = /<ul\b[^>]*\bclass="portfolio-tab-menu (parent|child)-categories"[^>]*>([\s\S]*?)<\/ul>/g;
const BOX = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*<img\b[^>]*\balt="([^"]*)"/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*(?:<strong>)?\s*Visit\b[^<]*?Website/i;
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

// every request to the site, a pause after the one before it
let last = 0;
let started = 0;
const late = (ms = 0) => Date.now() - started + ms > DEADLINE_MS;
async function paced(url: string, init: RequestInit = {}): Promise<Response> {
	await wait(Math.max(0, last + PACE_MS - Date.now()));
	try {
		return await fetch(url, {
			...init,
			headers: { 'User-Agent': UA, ...init.headers },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} finally {
		last = Date.now();
	}
}

// a request, a refusal waited out twice while the deadline allows
async function patient(url: string, init?: RequestInit): Promise<Response> {
	let resp = await paced(url, init);
	for (const delay of REFUSED_MS) {
		if (resp.status !== 429 || late(delay)) break;
		await resp.body?.cancel();
		await wait(delay);
		resp = await paced(url, init);
	}
	return resp;
}

// how a request went unanswered: a time-out, node's code for the failure,
// or its message
const whyOf = (err: unknown) =>
	err instanceof Error
		? err.name === 'TimeoutError'
			? 'no answer in time'
			: ((err.cause as { code?: string })?.code ?? err.message)
		: String(err);

// the site turning a request away, by a 429 or by leaving it unanswered
class Refused extends Error {}

interface Box {
	name: string;
	page: string;
}

// the wall, whole or through one tab
async function wall(tier?: 'first_tier' | 'second_tier', slug?: string): Promise<Box[]> {
	const form = new URLSearchParams({ action: 'load_filtered_portfolio', posts_per_page: '-1', orderby: 'name', order: 'asc' });
	if (tier && slug) form.append(`${tier}[]`, slug);
	const on = slug ? ` on ${slug}` : '';
	let resp: Response;
	let posts: string | undefined;
	try {
		resp = await patient(AJAX_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form
		});
		if (resp.ok) ({ posts } = (await resp.json()) as { posts?: string });
		else await resp.body?.cancel();
	} catch (err) {
		if (err instanceof SyntaxError) {
			throw new Error(`beco: the portfolio's answer could not be read${on}`, { cause: err });
		}
		// the request, or its answer, left hanging or cut off
		throw new Refused(`beco: the portfolio would not load (${whyOf(err)}${on})`, { cause: err });
	}
	if (resp.status === 429) {
		throw new Refused(`beco: the portfolio would not load (429${on})`);
	}
	if (!resp.ok) {
		throw new Error(`beco: the portfolio would not load (${resp.status}${on})`);
	}
	return [...(posts ?? '').matchAll(BOX)].map(([, href, alt]) => ({ name: clean(alt), page: unescape(href).trim() }));
}

// the company's site, from its page on the fund's site: nothing when the
// page will not load, and null when the site refuses it or leaves it
// unanswered
async function siteOf(page: string): Promise<string | null> {
	try {
		const resp = await paced(page);
		if (!resp.ok) {
			await resp.body?.cancel();
			return resp.status === 429 ? null : '';
		}
		const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
		return /^https?:\/\//i.test(site) ? site : '';
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	started = Date.now();
	let resp: Response;
	try {
		resp = await patient(PAGE_URL);
	} catch (err) {
		throw new Error(`beco: the portfolio page would not load (${whyOf(err)})`, { cause: err });
	}
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	// the tabs: each tier's slugs and how they are spelled out, "all" aside
	const tabs = [...html.matchAll(TIER)].flatMap(([, tier, body]) =>
		[...body.matchAll(TAB)]
			.map(([, slug, label]) => ({ tier: tier === 'parent' ? ('first_tier' as const) : ('second_tier' as const), slug, label: tag(label) }))
			.filter((t) => t.slug && !/^all$/i.test(t.slug))
	);
	// the way out first, the one tag most worth having
	const exits = (slug: string) => /^exits?$/i.test(slug);
	tabs.sort((a, b) => Number(exits(b.slug)) - Number(exits(a.slug)));

	type Listed = ScrapedCompany & { labels: string[]; exited: boolean };
	const companies = new Map<string, Listed>();
	for (const box of await wall()) {
		if (!box.name || STEALTH.test(box.name) || companies.has(box.name.toLowerCase())) continue;
		companies.set(box.name.toLowerCase(), { name: box.name, category: '', url: box.page || PAGE_URL, labels: [], exited: false });
	}
	if (companies.size === 0) {
		throw new Error('beco: no companies on the portfolio wall');
	}

	for (const { tier, slug, label } of tabs) {
		let boxes: Box[];
		try {
			boxes = await wall(tier, slug);
		} catch (err) {
			if (err instanceof Refused) break;
			throw err;
		}
		for (const box of boxes) {
			const company = companies.get(box.name.toLowerCase());
			if (!company) continue;
			if (exits(slug)) company.exited = true;
			else if (!company.labels.includes(label)) company.labels.push(label);
		}
	}

	for (const company of companies.values()) {
		if (!/^https?:\/\//i.test(company.url) || company.url === PAGE_URL) continue;
		if (late()) break;
		const site = await siteOf(company.url);
		if (site === null) break;
		company.url = site || company.url;
	}

	return [...companies.values()].map(({ labels, exited, ...company }) => ({
		...company,
		category: [...labels, exited ? 'Exited' : ''].filter(Boolean).join(', ')
	}));
}
