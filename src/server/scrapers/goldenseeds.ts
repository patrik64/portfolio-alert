import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.goldenseeds.com';
const PAGE_URL = `${BASE_URL}/our-companies`;
// the share of a list's stated size its pages must add up to
const MIN_SHARE = 0.95;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a site builder of its own on asp. the page holds two lists — the active
// companies and the exited ones — each showing its first twenty and saying
// how many pages it has and how many companies in all; "load more" posts the
// list's own filter form, with the page wanted, to an ajax address, which
// answers with the next twenty. each company is a card naming it under the
// sectors the fund files it in, its site behind a "View Website" button in
// its popup; an exited company has no site left, and a line of prose on how
// it went.

const LIST = /<div\b[^>]*\bclass="pm-projects-listing\b[^"]*"[^>]*>/g;
const ITEM = /(?=<div class="pm-item")/;
const NAME = /<h2 class="pm-title">([\s\S]*?)<\/h2>/;
const TAGS = /<div class="tags-listing">([\s\S]*?)<\/div>/;
const TAG = /<a\b[^>]*>([\s\S]*?)<\/a>/g;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*View Website/i;
const HIDDEN = /<input\b[^>]*\btype="hidden"[^>]*>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const attr = (element: string, name: string) =>
	element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '';

interface List {
	pages: number;
	total: number;
	source: string;
	form: URLSearchParams;
	exited: boolean;
	first: string;
}

// each list, with its first page and what its "load more" posts
function lists(html: string): List[] {
	const found = [...html.matchAll(LIST)];
	return found.map((m, i) => {
		const opening = m[0];
		const start = (m.index ?? 0) + opening.length;
		const end = found[i + 1]?.index ?? html.length;
		const formName = attr(opening, 'data-load-more-form');
		const form = new URLSearchParams();
		const formHtml =
			html.match(new RegExp(`<form\\b[^>]*\\bname="${formName}"[\\s\\S]*?<\\/form>`))?.[0] ?? '';
		for (const [input] of formHtml.matchAll(HIDDEN)) {
			form.append(attr(input, 'name'), unescape(attr(input, 'value')));
		}
		return {
			pages: Number(attr(opening, 'data-load-more')) || 1,
			total: Number(attr(opening, 'data-load-more-total')) || 0,
			source: unescape(attr(opening, 'data-load-more-source')),
			form,
			exited: /exit/i.test(form.get('search_status') ?? ''),
			first: html.slice(start, end)
		};
	});
}

async function page(list: List, n: number): Promise<string> {
	const body = new URLSearchParams([['page', String(n)], ...list.form]);
	const resp = await fetch(new URL(list.source.toLowerCase(), BASE_URL), {
		method: 'POST',
		headers: { 'User-Agent': UA },
		body
	});
	if (!resp.ok) {
		throw new Error(`goldenseeds: page ${n} of a list answered ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const list of lists(html)) {
		const pages = [list.first];
		for (let n = 2; n <= Math.min(list.pages, MAX_PAGES); n++) pages.push(await page(list, n));
		const items = pages.flatMap((p) => p.split(ITEM).slice(1));
		if (list.total > 0 && items.length < list.total * MIN_SHARE) {
			throw new Error(`goldenseeds: a list gave ${items.length} of the ${list.total} companies it states`);
		}
		for (const item of items) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const sectors = [...(item.match(TAGS)?.[1] ?? '').matchAll(TAG)].map((m) => tag(m[1]));
			companies.push({
				name,
				category: [...sectors, list.exited ? 'Exited' : '']
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: unescape(item.match(SITE)?.[1] ?? '')
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('goldenseeds: no companies on the companies page');
	}

	return companies;
}
