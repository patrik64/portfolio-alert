import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.firstcircle.capital/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is two collection lists of cards, a testimonial
// between them, every card a logo linking the company's site under the
// company's name and a line about it. two cards carry a logo and a link but
// no name, so a company without one is known by the address it links to,
// under the name it gives itself, looked up once; one missing from the list
// is named after its address until it is added. the cards say nothing of
// sectors or exits.
const NAMES: Record<string, string> = {
	'credrails.com': 'Credrails',
	'useklump.com': 'Klump'
};

const CARD = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bw-dyn-item\b)/;
const IS_COMPANY = /\bshowcase-card\b/;
const NAME = /<h\d[^>]*class="[^"]*\bportfolio-company-name\b[^"]*"[^>]*>([\s\S]*?)<\/h\d>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*\bclass="[^"]*\bportfolio-card-link-block\b/;
const STEALTH = /^stealth\b/i;

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
	for (const chunk of html.split(CARD).slice(1)) {
		if (!IS_COMPANY.test(chunk.slice(0, 400))) continue;
		const url = unescape(chunk.match(SITE)?.[1] ?? '');
		const host = hostOf(url);
		const name = clean(chunk.match(NAME)?.[1] ?? '') || (host ? (NAMES[host] ?? domainName(host)) : '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('firstcircle: no companies on the portfolio page');
	}

	return companies;
}
