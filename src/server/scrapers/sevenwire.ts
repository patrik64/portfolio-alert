import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.7wireventures.com/portfolio/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with wpbakery: the portfolio page is a grid of logos, most
// named in their alt text — with " - Exited" on the ones the fund is out
// of — over a line about the company and a "Learn more" button, both
// linking the company's page on the fund's site, where the company is the
// heading and its own site the link on the logo, or on a few, where the
// logo links nothing, a link in the text. a logo without alt text
// takes its name from that heading, or failing that from the logo's
// title; one logo links no page and keeps the fund's. those pages are
// fetched one at a time, and a page that will not load leaves its company
// linking to it. the page for one company links another's site, so a site
// two companies link stays with the one whose name it carries.

// a company's column opens on its logo's figure; the logo links the
// company's page, or nothing on one of them, whose "Learn more" does
const FIGURE = /(?=<figure class="wpb_wrapper vc_figure">)/;
const LOGO = /<img\b[^>]*\bclass="vc_single_image-img[^"]*"[^>]*>/;
const ALT = /\balt="([^"]*)"/;
const TITLE = /\btitle="([^"]*)"/;
const LOGO_LINK = /^<figure[^>]*>\s*<a\b[^>]*\bhref="([^"]*)"/;
const LEARN_MORE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*LEARN MORE\s*<\/a>/i;
const OWN_PAGE = /^https?:\/\/(?:www\.)?7wireventures\.com\/portfolio\/[^/]+/i;
const EXITED = /\s*[-–—]\s*exited\s*$/i;
// on the company's page: the column the logo heads, up to the sidebar of
// facts, with the logo's own link or the first in the text, and the heading
const MAIN = /\bportfolio-logo\b[\s\S]*?(?=\bsidebar\b|$)/;
const LOGO_SITE = /^portfolio-logo\b[^>]*>\s*<figure\b[^>]*>\s*<a\b[^>]*\bhref="([^"]*)"/;
const TEXT_SITE = /<a\b[^>]*\bclass="inline-link"[^>]*\bhref="([^"]*)"/;
const HEADING = /<h1\b[^>]*>([\s\S]*?)<\/h1>/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

// "Zerigo Health" -> "zerigohealth"
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

interface Detail {
	site: string;
	name: string;
}

// the company's site and name, from its page on the fund's site, or
// nothing when the page will not load; a refusal is waited out once
async function detailOf(page: string): Promise<Detail> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return { site: '', name: '' };
			const html = await resp.text();
			const main = html.match(MAIN)?.[0] ?? '';
			const site = unescape(main.match(LOGO_SITE)?.[1] ?? main.match(TEXT_SITE)?.[1] ?? '').trim();
			return {
				site: /^https?:\/\//i.test(site) && !/7wireventures\.com/i.test(site) ? site : '',
				name: clean(html.match(HEADING)?.[1] ?? '')
			};
		} catch {
			return { site: '', name: '' };
		}
	}
	return { site: '', name: '' };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const found: { name: string; exited: boolean; page: string; site: string }[] = [];
	const seen = new Set<string>();
	for (const column of html.split(FIGURE).slice(1)) {
		const logo = column.match(LOGO)?.[0] ?? '';
		const alt = clean(logo.match(ALT)?.[1] ?? '');
		const title = clean(logo.match(TITLE)?.[1] ?? '');
		const linked = unescape(column.match(LOGO_LINK)?.[1] ?? column.match(LEARN_MORE)?.[1] ?? '').trim();
		const page = OWN_PAGE.test(linked) ? linked : '';
		if (page) await wait(PACE_MS);
		const detail = page ? await detailOf(page) : { site: '', name: '' };
		const name = (alt || detail.name || title.replace(/\s+logo$/i, '')).replace(EXITED, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		found.push({ name, exited: EXITED.test(alt) || EXITED.test(title), page, site: detail.site });
	}
	if (found.length === 0) {
		throw new Error('7wire: no companies on the portfolio page');
	}

	const linkedBy = new Map<string, number>();
	for (const { site } of found) {
		const host = hostOf(site);
		if (host) linkedBy.set(host, (linkedBy.get(host) ?? 0) + 1);
	}
	return found.map(({ name, exited, page, site }) => {
		const host = hostOf(site);
		const theirs = host && ((linkedBy.get(host) ?? 0) < 2 || compact(host).includes(compact(name)));
		return { name, category: exited ? 'Exited' : '', url: theirs ? site : page || PAGE_URL };
	});
}
