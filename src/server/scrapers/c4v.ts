import type { ScrapedCompany } from './types';

const BASE_URL = 'https://c4v.com';
const PAGE_URL = `${BASE_URL}/companies/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const MAX_PAGES = 30;
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page opens on a handful of
// spotlit companies and draws the rest through admin-ajax, sixteen cards
// at a time — each the name, the country and a line about it, linking the
// company's page on the firm's site. the list is asked for the way the
// page's own script asks ("getCompanies"), all of it and then through its
// filters: the fund each company sits in ("C4 Ventures II", or "Angel
// Investments", the partners' own), and its status, of which "Exited" and
// "IPO" mark the exits. a page of the list that will not come fails the
// run, rather than take a part of the list for the whole. a company's own
// site is the "Visit Website" link on its page; those pages are fetched one
// at a time, and a page that will not load leaves its company linking to
// it.

const CARD = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="company-card"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /class="company-card__ttl"[^>]*>([\s\S]*?)<\/h3>/;
const TERM = /class="company-card__term"[^>]*>([\s\S]*?)<\/li>/g;
// a filter's choices: the taxonomy, its slugs and how each is spelled out
const SELECT = /<select\b[^>]*\bname="([\w-]+)"[^>]*>([\s\S]*?)<\/select>/g;
const OPTION = /<option\b[^>]*\bvalue="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>(?:\s*<[^>]+>)*\s*Visit Website\s*</i;
const REFUSED_MS = 20_000;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Card {
	name: string;
	page: string;
	terms: string[];
}

// the company's site, from its page on the firm's site, or nothing when the
// page will not load; a refusal is waited out once
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

// every card the list holds, filtered by one term of one taxonomy or not at all
async function list(filter?: { taxonomy: string; slug: string }): Promise<Card[]> {
	const cards: Card[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		if (page > 1 || filter) await wait(PACE_MS);
		const form = new URLSearchParams({ action: 'getCompanies', paged: String(page), is_spotlight: '0', lang: 'en' });
		if (filter) form.append(`tax_filters[${filter.taxonomy}][]`, filter.slug);
		const resp = await fetch(AJAX_URL, {
			method: 'POST',
			headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form
		});
		if (!resp.ok) {
			throw new Error(`c4v: the company list would not load (${resp.status} on page ${page})`);
		}
		const answer = (await resp.json()) as { success?: boolean; data?: { loop_content?: string; has_more?: boolean } };
		if (!answer.success) {
			throw new Error(`c4v: the company list answered no list on page ${page}`);
		}
		for (const [, href, body] of (answer.data?.loop_content ?? '').matchAll(CARD)) {
			cards.push({
				name: clean(body.match(NAME)?.[1] ?? ''),
				page: unescape(href).trim(),
				// "Other" as a country says nothing
				terms: [...body.matchAll(TERM)].map(([, term]) => tag(term)).filter((t) => t && !/^other$/i.test(t))
			});
		}
		if (!answer.data?.has_more) break;
	}
	return cards;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const options = (taxonomy: string) =>
		[...html.matchAll(SELECT)]
			.filter(([, name]) => name === taxonomy)
			.flatMap(([, , body]) => [...body.matchAll(OPTION)].map(([, slug, label]) => ({ slug, label: tag(label) })))
			.filter((o) => o.slug);

	type Listed = ScrapedCompany & { labels: string[]; exited: boolean };
	const companies = new Map<string, Listed>();
	for (const card of await list()) {
		if (!card.name || STEALTH.test(card.name) || companies.has(card.name.toLowerCase())) continue;
		companies.set(card.name.toLowerCase(), {
			name: card.name,
			category: '',
			url: /^https?:\/\//i.test(card.page) ? card.page : PAGE_URL,
			labels: [...card.terms],
			exited: false
		});
	}
	if (companies.size === 0) {
		throw new Error('c4v: no companies in the company list');
	}

	for (const { slug, label } of options('fund-company')) {
		const fund = /^angel/i.test(label) ? 'Angel Investment' : label;
		for (const card of await list({ taxonomy: 'fund-company', slug })) {
			const company = companies.get(card.name.toLowerCase());
			if (company && !company.labels.includes(fund)) company.labels.push(fund);
		}
	}
	for (const { slug, label } of options('status-company').filter((o) => /^(exited|ipo)$/i.test(o.slug))) {
		for (const card of await list({ taxonomy: 'status-company', slug })) {
			const company = companies.get(card.name.toLowerCase());
			if (!company) continue;
			company.exited = true;
			if (/^ipo$/i.test(slug) && !company.labels.includes(label)) company.labels.push(label);
		}
	}

	for (const company of companies.values()) {
		if (company.url === PAGE_URL) continue;
		await wait(PACE_MS);
		company.url = (await siteOf(company.url)) || company.url;
	}

	return [...companies.values()].map(({ labels, exited, ...company }) => ({
		...company,
		category: [...labels, exited ? 'Exited' : ''].filter(Boolean).join(', ')
	}));
}
