import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://astanor.com/portfolio/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with avada: the portfolio page is a grid of cards, each the
// company's logo, its name, the fund it sits in ("Venture", "Seed",
// "Growth"), kept as a tag, and a line about it, linking the company's
// page on the fund's site, whose "Visit website" button links its own
// site; a few cards are drawn twice. those pages are fetched one at a
// time, and a page that will not load, or has no such button, leaves its
// company linking to it. a company the fund is out of wears an "Exited"
// badge drawn into its logo, which the page puts in words only in the
// image's file name ("TheGutStuff-exited-400×236-1.jpg"), and that is
// where it is read.

const CARD = /(?=<li\b[^>]*\bclass="[^"]*\bpost-card\b)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const IMAGE = /<img\b[^>]*\bsrc="([^"]*)"/;
const NAME = /\bportfolio-case-title\b[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/;
const FUND = /\bportfolio-case-fund\b[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/;
const EXIT_BADGE = /(?:^|[-_\s])exit(?:ed)?(?=[-_\s×x]|$)/i;
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

// "…/uploads/2023/05/TheGutStuff-exited-400×236-1.jpg" -> "TheGutStuff-exited-400×236-1"
const fileOf = (src: string) => {
	const last = unescape(src).split(/[?#]/)[0].split('/').pop() ?? '';
	try {
		return decodeURIComponent(last).replace(/\.\w+$/, '');
	} catch {
		return last.replace(/\.\w+$/, '');
	}
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the company's site, from the "Visit website" button on its page on the
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
				if (/^https?:\/\//i.test(site) && !/astanor\.com/i.test(site)) return site;
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(CARD).slice(1)) {
		const card = chunk.slice(0, chunk.indexOf('</li>') + 1 || undefined);
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = unescape(card.match(LINK)?.[1] ?? '').trim();
		const page = /^https?:\/\//i.test(href) ? href : '';
		const exited = EXIT_BADGE.test(fileOf(card.match(IMAGE)?.[1] ?? ''));
		if (page) await wait(PACE_MS);
		const site = page ? await siteOf(page) : '';
		companies.push({
			name,
			category: [tag(card.match(FUND)?.[1] ?? ''), exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: site || page || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('astanor: no companies on the portfolio page');
	}

	return companies;
}
