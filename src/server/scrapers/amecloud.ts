import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.amecloudventures.com/portfolio';
// the portfolio page loads its companies from this widget, as jsonp
const WIDGET_URL = 'https://ame.ivest.in/people/9/embeddable_portfolio?callback=portfolio';
// the widget's server now and then answers a 500 and the page on the next
// try, so a server error or a refusal is asked about again, twice, after
// waits that double from two seconds
const TRIES = 3;
const RETRY_MS = 2_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is an empty frame, three placeholder pictures
// left from its template, that a script fills with a portfolio widget
// served by ivest — a card for each company, named, with a line about it
// and a link to its site. a company the fund is out of has a card of its
// own kind, "exit", that shows the company's logo under the name of its
// buyer ("Amazon") or "IPO", and nowhere the company's name in words, so
// those companies are kept here by their logos, as the logos read; a logo
// not listed here is named after the company's angellist or crunchbase
// page until it is added. the buyer is kept as "Acquired by Amazon".
const EXITS: Record<string, string> = {
	'4': 'Metacloud',
	'81': 'Pure Storage',
	'120': 'Zoom',
	'225': 'RelateIQ',
	'304': 'Opsmatic',
	'510': 'Lyft',
	'606': 'Curbside',
	'609': 'Bina Technologies',
	'3439': 'Stemcentrx',
	'11764': 'Nervana Systems',
	'12359': 'Cruise',
	'12792': 'eero',
	'30648': 'Sapho',
	'31033': 'Twist Bioscience',
	'31236': 'Treasure Data',
	'35377': 'Ozlo',
	'36956': 'Voicera'
};

const ITEM = /(?=<div class='ivp_item\b)/;
const KIND = /^<div class='ivp_item([^']*)'/;
const DATA_URL = /^<div\b[^>]*\bdata-url='([^']*)'/;
const NAME = /class="ivp_name"[^>]*>([\s\S]*?)<\/div>/;
const LOGO = /\/uploaded_logo\/(\d+)\//;
const WEB_LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*<img\b[^>]*\balt="Web\d*"/;
// "https://angel.co/curbside-1" -> "curbside", ".../organization/treasure-data" -> "treasure-data"
const PROFILE = /\bhref="https?:\/\/(?:www\.)?(?:angel\.co\/(?:company\/)?|crunchbase\.com\/organization\/)([\w-]+?)(?:-\d+)?"/;
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

// "treasure-data" -> "Treasure Data"
const spelled = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function widget(): Promise<string> {
	for (let attempt = 1; ; attempt++) {
		const resp = await fetch(WIDGET_URL, { headers: { 'User-Agent': UA, Referer: PAGE_URL } });
		if (resp.ok) return resp.text();
		if ((resp.status >= 500 || resp.status === 429) && attempt < TRIES) {
			await resp.body?.cancel();
			await wait(RETRY_MS * 2 ** (attempt - 1));
			continue;
		}
		throw new Error(`Failed to fetch ${WIDGET_URL}: ${resp.status}`);
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const jsonp = await widget();
	const json = jsonp.slice(jsonp.indexOf('(') + 1, jsonp.lastIndexOf(')'));
	const html = (JSON.parse(json) as { html?: string }).html ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const exit = /\bexit\b/.test(item.match(KIND)?.[1] ?? '');
		const shown = clean(item.match(NAME)?.[1] ?? '');
		const profile = item.match(PROFILE)?.[1];
		const name = exit ? (EXITS[item.match(LOGO)?.[1] ?? ''] ?? (profile ? spelled(profile) : '')) : shown;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const went = exit ? (/^ipo$/i.test(shown) ? 'IPO' : shown ? `Acquired by ${tag(shown)}` : '') : '';
		const site = unescape(item.match(DATA_URL)?.[1] || item.match(WEB_LINK)?.[1] || '').trim();
		companies.push({
			name,
			category: [went, exit ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('amecloud: no companies in the portfolio widget');
	}

	return companies;
}
