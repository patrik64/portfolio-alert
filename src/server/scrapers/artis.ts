import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.av.co';
const PAGE_URL = `${BASE_URL}/companies`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is a list of cards under a heading for each
// field ("TechBio®", "Tech + Health", "Frontier Tech"), kept as a tag, each
// card naming the company, tagged "Acquired" or "IPO" for the ones the
// fund is out of, and linking the company's page on the fund's site, whose
// "visit website" button links its own site. those pages are fetched one
// at a time, and a page that will not load, or has no such button, leaves
// its company linking to it.

const FIELD = /<h2\b[^>]*\bclass="av-heading\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/g;
const CARD = /(?=<div\b[^>]*\bclass="[^"]*\bcompanies-item\b)/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const SPECIAL = /class="inline-text special-tag[^"]*"[^>]*>([\s\S]*?)<\/p>/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const OUT = /^(?:acquired|ipo|merged|exited|public)\b/i;
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

// the company's site, from the "visit website" button on its page on the
// fund's site, or nothing when the page will not load; a refusal is
// waited out once
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
				if (!/^visit website$/i.test(clean(body))) continue;
				const site = unescape(attributes.match(HREF)?.[1] ?? '').trim();
				if (/^https?:\/\//i.test(site) && !/\bav\.co\b/i.test(site)) return site;
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
	const fields = [...html.matchAll(FIELD)].map((m) => ({ at: m.index ?? 0, field: tag(m[1]) }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let at = 0;
	for (const card of html.split(CARD).slice(1)) {
		at = html.indexOf(card, at);
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const field = fields.filter((f) => f.at < at).at(-1)?.field ?? '';
		const special = tag(card.match(SPECIAL)?.[1] ?? '');
		const out = OUT.test(special);
		const href = unescape(card.match(LINK)?.[1] ?? '').trim();
		const page = href ? new URL(href, BASE_URL).href : '';
		if (page) await wait(PACE_MS);
		const site = page ? await siteOf(page) : '';
		companies.push({
			name,
			category: [field, special, out ? 'Exited' : ''].filter((t, i, all) => t && all.indexOf(t) === i).join(', '),
			url: site || page || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('artis: no companies on the companies page');
	}

	return companies;
}
