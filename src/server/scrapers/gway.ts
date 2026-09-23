import type { ScrapedCompany } from './types';

const BASE_URL = 'https://gwaycapital.com';
const LIST_URL = `${BASE_URL}/wp-json/wp/v2/portfolio?per_page=100&_fields=title,link`;
const BATCH_SIZE = 8;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is an isotope grid, twelve to a page, each
// company a picture and a line linking a page of its own here. the rest api's
// portfolio type holds every one of them in a single request, named, and the
// company's page gives its founder and, under a "Website" heading, its site —
// those pages are fetched in batches. one that will not load, or names no
// site, leaves its company linking to that page. the fund files its
// companies under nothing and marks no exits.

const WEBSITE = /<span>\s*Website\s*<\/span>[\s\S]*?<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/i;
const STEALTH = /^stealth\b/i;

interface Entry {
	title?: { rendered?: string };
	link?: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function siteOf(page: string): Promise<string> {
	try {
		const resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return '';
		return unescape((await resp.text()).match(WEBSITE)?.[1] ?? '');
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(LIST_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${LIST_URL}: ${resp.status}`);
	}
	const entries = (await resp.json()) as Entry[];
	const total = Number(resp.headers.get('x-wp-total')) || 0;
	if (total > entries.length) {
		throw new Error(`gway: the rest api listed ${entries.length} of ${total} companies in one page`);
	}

	const listed: { name: string; page: string }[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const name = clean(entry.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		listed.push({ name, page: entry.link ?? '' });
	}
	if (listed.length === 0) {
		throw new Error('gway: the rest api lists no companies');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const sites = await Promise.all(batch.map((c) => (c.page ? siteOf(c.page) : Promise.resolve(''))));
		batch.forEach((c, j) => companies.push({ name: c.name, category: '', url: sites[j] || c.page }));
	}

	return companies;
}
