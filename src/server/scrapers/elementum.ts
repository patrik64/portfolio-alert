import type { ScrapedCompany } from './types';

const BASE_URL = 'https://elementum.vc';
const PAGE_URL = `${BASE_URL}/companies`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the companies page is a plain list of names, most linking a
// page about the company on the fund's site and a few its site outright. a
// company's page has a "Website" button for its site, so those pages are
// fetched for that; one that will not load leaves its company linking to
// that page. the page files companies under nothing and marks no exit.

const LIST = /class="list-companies"[\s\S]*?<\/ul>/;
const ENTRY = /<li>\s*<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const WEBSITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>(?:\s|<[^>]+>)*Website\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the site a company's page gives, or nothing when the page will not load
async function siteOf(page: string): Promise<string> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return '';
		return unescape((await resp.text()).match(WEBSITE)?.[1] ?? '');
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const list = (await resp.text()).match(LIST)?.[0] ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let fetched = 0;
	for (const [, href, label] of list.matchAll(ENTRY)) {
		const name = clean(label);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const link = new URL(unescape(href).trim(), BASE_URL).href;
		let url = link;
		if (link.startsWith(BASE_URL)) {
			if (fetched++ > 0) await wait(PACE_MS);
			url = (await siteOf(link)) || link;
		}
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('elementum: no companies on the companies page');
	}

	return companies;
}
