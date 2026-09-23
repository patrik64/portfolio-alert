import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://inertia.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a react app on vercel, rendered on the server: each company is a numbered
// card in the company's brand colour, linking its own site, labelled with a
// sector (ai, defense, fintech, proptech…) and showing its logo. the logo's
// alt text names the company; the one card without a logo writes the name out
// instead. an exit is a line under the logo — "Acquired by Nvidia" — which is
// kept, with the Exited tag after it.

// the brand colour is set on the card itself, and on nothing else
const CARD = /<a href="(https?:\/\/[^"]+)"[^>]*style="--brand-color:[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const LABEL = /<span class="block font-mono[^"]*"[^>]*>([^<]*)<\/span>/g;
const LOGO = /<img[^>]*\salt="([^"]+)"/;
// a written-out name can run over several lines, each a span of its own, so
// the caption is read to the end of the logo's box
const CAPTION = /<span class="font-display[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const EXIT = /(Acquired by[\s\S]*?)<\/span>/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, body] of html.matchAll(CARD)) {
		// the pictures inside a logo can hold markup of their own
		const card = body.replace(/<svg[\s\S]*?<\/svg>/g, '');
		const name = clean(card.match(LOGO)?.[1] ?? '') || clean(card.match(CAPTION)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		// the labels above the logo are the card's number, then its sector
		// (css sets the sector in capitals; the text keeps its own case, "PropTech")
		const sector = clean([...card.matchAll(LABEL)].map((m) => m[1])[1] ?? '');
		const exit = clean(card.match(EXIT)?.[1] ?? '');
		companies.push({
			name,
			category: [sector, exit, exit ? 'Exited' : ''].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('inertia: no companies on the portfolio page');
	}

	return companies;
}
