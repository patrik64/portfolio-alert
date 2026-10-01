import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.atoneventures.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a list of companies for each industry
// ("Agriculture & Food", "Energy Storage"), each company named and linking
// its page on the fund's site, whose "Website" button links its own site.
// a company takes the industries it is listed under as tags. its page is
// fetched once, one at a time, and a page that will not load, or has no
// such button, leaves its company linking to it. nothing marks an exit.

const INDUSTRY = /<h3\b[^>]*\bclass="heading-13"[^>]*>([\s\S]*?)<\/h3>/g;
const ITEM = /(?=<div\b[^>]*\bclass="company-list\b)/;
const NAME = /class="heading-12"[^>]*>([\s\S]*?)<\//;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
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

// the company's site, from the "Website" button on its page on the fund's
// site, or nothing when the page will not load; a refusal is waited out
// once
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
			for (const [, attributes, body] of (await resp.text()).matchAll(ANCHOR)) {
				if (!/^website$/i.test(clean(body))) continue;
				const site = unescape(attributes.match(HREF)?.[1] ?? '').trim();
				if (/^https?:\/\//i.test(site) && !/atoneventures\.com/i.test(site)) return site;
			}
			return '';
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

	// each industry's list runs from its heading to the next one's
	const headings = [...html.matchAll(INDUSTRY)].map((m) => ({ at: m.index ?? 0, industry: tag(m[1]) }));
	const found = new Map<string, { name: string; page: string; tags: string[] }>();
	headings.forEach(({ at, industry }, i) => {
		const list = html.slice(at, headings[i + 1]?.at);
		for (const item of list.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name)) continue;
			const href = unescape(item.match(LINK)?.[1] ?? '').trim();
			const company = found.get(name.toLowerCase()) ?? {
				name,
				page: href ? new URL(href, BASE_URL).href : '',
				tags: []
			};
			if (industry && !company.tags.includes(industry)) company.tags.push(industry);
			found.set(name.toLowerCase(), company);
		}
	});
	if (found.size === 0) {
		throw new Error('atone: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (const { name, page, tags } of found.values()) {
		if (page) await wait(PACE_MS);
		const site = page ? await siteOf(page) : '';
		companies.push({ name, category: tags.join(', '), url: site || page || PAGE_URL });
	}

	return companies;
}
