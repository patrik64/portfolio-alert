import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.f7ventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress under elementor, the whole portfolio on the one page: every
// company is a logo tile with a popup behind it that names the company,
// says what it does and links its site ("Visit Website"). a company the
// fund is out of carries "acquired" among its classes and a band across the
// logo naming the buyer ("ACQ BY Microsoft"), kept as "Acquired by
// Microsoft" with the Exited tag. a tile named "Stealth" is an investment
// the fund has not named, and is left out.

const ITEM = /(?=<div[^>]*class="[^"]*\bportfolio_item\b)/;
const OPENING = /^<div[^>]*>/;
const NAME = /class="team_popup_header"[^>]*>\s*<h\d[^>]*>([\s\S]*?)<\/h\d>/;
const SITE = /class="portfolio_link"[^>]*>\s*<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const BAND = /class="acq_txt"[^>]*>([\s\S]*?)<\/div>/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a note holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "ACQ BY Microsoft" -> "Acquired by Microsoft"
const outcome = (band: string) => tag(band).replace(/^acq(?:uired)?\.?\s+by\b/i, 'Acquired by');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ITEM).slice(1)) {
		const item = chunk.split('<!-- end .portfolio_item -->')[0];
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exited = /\bacquired\b/.test(item.match(OPENING)?.[0] ?? '');
		const band = outcome(item.match(BAND)?.[1] ?? '');
		companies.push({
			name,
			category: exited || band ? [band || 'Acquired', 'Exited'].join(', ') : '',
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('f7: no companies on the portfolio page');
	}

	return companies;
}
