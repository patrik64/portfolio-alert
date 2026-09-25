import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fintechv.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio is a gallery of logos, each a slide linking the
// company's site, with image files named anything at all ("download
// (2).png", a screenshot) and a title only where the fund has something to
// say — "Acquired by Neuberger Berman" — which is kept with the Exited tag.
// no name is written anywhere, so a company is known by the address it links
// to, under the name it gives itself, looked up once; one missing from the
// list is named after its address until it is added.
const NAMES: Record<string, string> = {
	'aiologic.io': 'AIO Logic',
	'groundfloor.us': 'Groundfloor',
	'ioufinancial.com': 'IOU Financial',
	'maxrewards.co': 'MaxRewards',
	'momnt.com': 'Momnt',
	'paxafe.com': 'PAXAFE',
	'redkik.com': 'Redkik',
	'trykredit.com': 'Kredit',
	'vero-technologies.com': 'Vero'
};

const SLIDE = /(?=<div class="slide" data-type="image")/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const TITLE = /class="image-slide-title"[^>]*>([\s\S]*?)<\/div>/;
const EXIT = /^(acquired|merged|ipo|listed|exited)\b/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

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

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

// "getfoo.com" -> "Foo", "ark-climate.de" -> "Ark Climate"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return label
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const slide of html.split(SLIDE).slice(1)) {
		const url = unescape(slide.match(LINK)?.[1] ?? '');
		const host = hostOf(url);
		if (!host) continue;
		const name = NAMES[host] ?? domainName(host);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const title = tag(slide.match(TITLE)?.[1] ?? '');
		companies.push({
			name,
			category: title ? (EXIT.test(title) ? `${title}, Exited` : title) : '',
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('fintechv: no logos in the portfolio gallery');
	}

	return companies;
}
