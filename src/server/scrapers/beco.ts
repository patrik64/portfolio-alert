import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.becocapital.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the portfolio page is empty until its script
// draws the wall through admin-ajax, a logo a company, named in its alt
// text and linking the company's page on the fund's site. the wall is
// asked for the way the script asks ("load_filtered_portfolio"), all of it
// and then through its tabs: the stage ("Early Stage", "Growth Stage") or
// "Exits", and the sector ("FinTech", "PropTech"). a tab that will not
// come fails the run, rather than take a part of the list for the whole.
// a company's own site is the "Visit … Website" link on its page; those
// pages are fetched one at a time, and a page that will not load leaves
// its company linking to it.

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

interface Box {
	name: string;
	page: string;
}

// the wall, whole or through one tab; a refusal is waited out once, as the
// site turned the nightly run's first request away with a 429 on 10 October 2026
async function wall(tier?: 'first_tier' | 'second_tier', slug?: string): Promise<Box[]> {
	const form = new URLSearchParams({ action: 'load_filtered_portfolio', posts_per_page: '-1', orderby: 'name', order: 'asc' });
	if (tier && slug) form.append(`${tier}[]`, slug);
	const ask = () =>
		fetch(AJAX_URL, {
			method: 'POST',
			headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form
		});
	let resp = await ask();
	if (resp.status === 429) {
		await resp.body?.cancel();
		await wait(REFUSED_MS);
		resp = await ask();
	}
	if (!resp.ok) {
		throw new Error(`beco: the portfolio would not load (${resp.status}${slug ? ` on ${slug}` : ''})`);
	}
	const { posts } = (await resp.json()) as { posts?: string };
	return [...(posts ?? '').matchAll(BOX)].map(([, href, alt]) => ({ name: clean(alt), page: unescape(href).trim() }));
}

// the company's site, from its page on the fund's site, or nothing when
// the page will not load; a refusal is waited out once
async function siteOf(page: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
			return /^https?:\/\//i.test(site) ? site : '';
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
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
		await wait(PACE_MS);
		for (const box of await wall(tier, slug)) {
			const company = companies.get(box.name.toLowerCase());
			if (!company) continue;
			if (/^exits?$/i.test(slug)) company.exited = true;
			else if (!company.labels.includes(label)) company.labels.push(label);
		}
	}

	for (const company of companies.values()) {
		if (!/^https?:\/\//i.test(company.url) || company.url === PAGE_URL) continue;
		await wait(PACE_MS);
		company.url = (await siteOf(company.url)) || company.url;
	}

	return [...companies.values()].map(({ labels, exited, ...company }) => ({
		...company,
		category: [...labels, exited ? 'Exited' : ''].filter(Boolean).join(', ')
	}));
}
