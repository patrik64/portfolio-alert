import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.echovc.com';
// the portfolio, the eco pilot portfolio and the blockchain portfolio, each
// a page of its own, the last two tagged with their name
const GALLERIES: [path: string, segment: string][] = [
	['/ourportfolio', ''],
	['/our-eco-pilot-portfolio', 'Eco Pilot'],
	['/our-blockchain-portfolio', 'Blockchain']
];
const PAGE_URL = `${BASE_URL}${GALLERIES[0][0]}`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: three portfolio pages, each a gallery of logos linking a
// page per company on the fund's site. that page is titled with the name;
// its logo, or else the name's heading, links the company's site; and
// blocks headed "Themes / Sectors",
// "Investment Year & Stage" and "target Geographies" file it. one the fund
// is out of says so in its first line — "(acquired by Naspers/OLX)" — or in
// its logo's file name. the companies' pages are fetched for all that; one
// that will not load leaves its company named off its logo, linking to it.

const SLIDE = /<a\b[^>]*\bhref="([^"]+)"[^>]*\bclass="[^"]*\bimage-slide-anchor\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const ALT = /\balt="([^"]*)"/;
const TITLE = /<title>([\s\S]*?)<\/title>/;
const SITE = /class="[^"]*\bsqs-block-image-link\b[^"]*"[^>]*\bhref="(https?:\/\/[^"]+)"|\bhref="(https?:\/\/[^"]+)"[^>]*class="[^"]*\bsqs-block-image-link\b/;
const HEADING_LINK = /<h1\b[^>]*>\s*<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const FIELD = (label: string) => new RegExp(`<h3[^>]*>\\s*${label}\\s*<\\/h3>\\s*<p[^>]*>([\\s\\S]*?)<\\/p>`, 'i');
const SECTORS = FIELD('Themes\\s*\\/\\s*Sectors');
const INVESTED = FIELD('Investment Year\\s*(?:&amp;|&)\\s*Stage');
const GEOGRAPHIES = FIELD('target Geographies');
const OUTCOME = /\((acquired by [^)]+|acquired|exited[^)]*|merged with [^)]+|ipo)\)/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&mdash;/g, '—')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a list the site writes comma-separated, as tags
const tags = (s: string) => clean(s).split(',').map((t) => tag(t)).filter(Boolean);

// a name read off a logo's file, for a page that will not load: "Kukua
// logo.jpg" is Kukua
const nameOfLogo = (alt: string) =>
	clean(alt)
		.replace(/\.[a-z0-9]+$/i, '')
		.replace(/[_-]/g, ' ')
		.replace(/\b(logo|site|exited)\b/gi, '')
		.replace(/\s+/g, ' ')
		.trim();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// a company's page, or nothing when it will not load
async function pageOf(url: string): Promise<string> {
	try {
		let resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(url, { headers: { 'User-Agent': UA } });
		}
		return resp.ok ? await resp.text() : '';
	} catch {
		return '';
	}
}

interface Slide {
	page: string;
	alt: string;
	segment: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const slides: Slide[] = [];
	for (const [path, segment] of GALLERIES) {
		const html = await fetchText(`${BASE_URL}${path}`);
		for (const [, href, body] of html.matchAll(SLIDE)) {
			slides.push({
				page: new URL(unescape(href), BASE_URL).href,
				alt: unescape(body.match(ALT)?.[1] ?? ''),
				segment
			});
		}
	}
	if (slides.length === 0) {
		throw new Error('echovc: no companies on the portfolio pages');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, slide] of slides.entries()) {
		if (i > 0) await wait(PACE_MS);
		const page = slide.page.startsWith(BASE_URL) ? await pageOf(slide.page) : '';
		const name = clean(page.match(TITLE)?.[1] ?? '').split(/\s+—\s+/)[0] || nameOfLogo(slide.alt);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(page.match(SITE)?.slice(1).find(Boolean) ?? page.match(HEADING_LINK)?.[1] ?? '');
		const outcome = clean(page).match(OUTCOME)?.[1] ?? '';
		const exited = Boolean(outcome) || /exited/i.test(slide.alt);
		const year = clean(page.match(INVESTED)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		companies.push({
			name,
			category: [
				...tags(page.match(SECTORS)?.[1] ?? ''),
				...tags(page.match(GEOGRAPHIES)?.[1] ?? ''),
				year ? `Invested ${year}` : '',
				slide.segment,
				outcome ? tag(outcome[0].toUpperCase() + outcome.slice(1)) : '',
				exited ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: site || slide.page
		});
	}

	return companies;
}
