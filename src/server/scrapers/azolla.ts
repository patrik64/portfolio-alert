import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://azollaventures.com/our-portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the portfolio page is two galleries of logos,
// under "Azolla Fund I Portfolio" and "Prime Impact Fund Portfolio", the
// fund the team ran before, each logo titled with the company over a line
// about it and linking its site. the fund a company sits under is kept as
// a tag. a company the fund is out of wears an "EXIT" badge drawn into its
// logo, which the page puts in words only in the image's file name
// ("heaten-logo-exit-v3.png"), and that is where it is read.

const SECTION = /(?=<h2\b)/;
const HEADING = /^<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const ITEM = /(?=<div class="jet-images-layout__item\b)/;
const TITLE = /<h5\b[^>]*\bclass="jet-images-layout__title"[^>]*>([\s\S]*?)<\/h5>/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const IMAGE = /<img\b[^>]*\bsrc="([^"]*)"/;
const EXIT_BADGE = /(?:^|[-_\s])exit(?:ed)?(?=[-_\s@]|$)/i;
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

// "…/uploads/2026/01/heaten-logo-exit-v3.png" -> "heaten-logo-exit-v3"
const fileOf = (src: string) => {
	const last = unescape(src).split(/[?#]/)[0].split('/').pop() ?? '';
	try {
		return decodeURIComponent(last).replace(/\.\w+$/, '');
	} catch {
		return last.replace(/\.\w+$/, '');
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let fund = '';
	for (const section of html.split(SECTION)) {
		const heading = clean(section.match(HEADING)?.[1] ?? '');
		if (/\bportfolio$/i.test(heading)) fund = tag(heading.replace(/\s*\bportfolio$/i, ''));
		for (const item of section.split(ITEM).slice(1)) {
			const name = clean(item.match(TITLE)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const site = unescape(item.match(LINK)?.[1] ?? '').trim();
			const exited = EXIT_BADGE.test(fileOf(item.match(IMAGE)?.[1] ?? ''));
			companies.push({
				name,
				category: [fund, exited ? 'Exited' : ''].filter(Boolean).join(', '),
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
	}
	if (companies.length === 0) {
		throw new Error('azolla: no companies in the galleries');
	}

	return companies;
}
