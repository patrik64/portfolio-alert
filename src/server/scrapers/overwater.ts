import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.overwater.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, though the portfolio is not a collection the site could be asked
// for — there is no portfolio type in the rest api, only a page with the cards
// written into it. a card is a logo linked to the company, a line about it,
// and the half of the fund it is filed under.
//
// no card carries a name. so the line under the logo names the company where
// it opens with one — "Gameto is a new breed of biotechnology company" — and
// the address names it otherwise. the line is only believed when what it says
// and the address are the same word, which is what lets Gameto stand against
// gametogen.com and Conceive against weconceive.com, and would stop a
// paragraph that opened with somebody else's name.
//
// failing both, the logo file is allowed to put a space back where it agrees
// with the address, which it does once: penguin-ai against penguinai.co. the
// rest are Portfolio-Logo-7 and two that still carry the name of the tool that
// drew them.

const CARD = /<a class="card"[^>]*>[\s\S]*?<\/a>/g;
const HREF = /href="(https?:\/\/[^"]+)"/;
const MEDIA = /data-media="([^"]*)"/;
const LOGO = /class="non-hover"[^>]*src="([^"?]+)"/;
const BLURB = /<p>([\s\S]*?)<\/p>/;

// a line that opens by naming the company and saying what it does
const OPENS =
	/^([A-Z][\w.&'’-]*(?:\s+[A-Z0-9][\w.&'’-]*){0,3})\s+(?:is|are|was|were|has|have|builds?|provides?|uses?|turns?|makes?|helps?|offers?|develops?|creates?|delivers?|brings?|combines?)\b/;

// what a company puts in front of its brand to get a free address
const DECORATION = /^(?:hello|hey|with|get|try|use|join|meet|my|the)(?=[a-z]{3,})/;
// the two colours every logo is exported in
const SHADE = /[-_](?:blk|wht|black|white)$/i;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const clean = (s: string) => un(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const titled = (s: string) =>
	s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;

// the same brand written two ways — spaces, hyphens and capitals set aside
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// the fund files a company under one of two halves, written as a slug
const label = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((word) => word.replace(/^[a-z]/, (c) => c.toUpperCase()))
		.join(' ');

const fromLogo = (src: string) =>
	clean(
		(src.split('/').pop() ?? '')
			.replace(/\.[a-z0-9]+$/i, '')
			.replace(SHADE, '')
			.replace(/[-_]+/g, ' ')
	);

const fromHost = (url: string) => {
	try {
		const host = new URL(url).hostname.replace(/^www\./, '');
		return (host.split('.')[0] ?? '').replace(DECORATION, '');
	} catch {
		return '';
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
	for (const card of html.match(CARD) ?? []) {
		const url = card.match(HREF)?.[1];
		if (!url) continue;

		const host = fromHost(url);
		if (!host) continue;

		const spoken = clean(card.match(BLURB)?.[1] ?? '').match(OPENS)?.[1] ?? '';
		const logo = fromLogo(card.match(LOGO)?.[1] ?? '');

		let name = '';
		if (spoken && (key(host).includes(key(spoken)) || key(spoken).includes(key(host)))) {
			name = spoken;
		} else if (logo && key(logo) === key(host)) {
			name = titled(logo);
		} else {
			name = titled(host.replace(/-+/g, ' '));
		}
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: label(card.match(MEDIA)?.[1] ?? ''), url });
	}

	if (companies.length === 0) {
		throw new Error('overwater: no companies on the portfolio page');
	}

	return companies;
}
