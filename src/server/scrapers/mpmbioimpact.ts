import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://mpmbioimpact.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of logos, the fund's active
// portfolio, the whole of it in the page, a logo a company named in its alt
// text ("Aktis Logo", "Entrada Therapeutics, Inc. Logo") and linking its
// site, or opening a panel where it has none. the page keeps older panels
// with categories commented out, and they are passed over. the legal form
// is not part of a name. the page lists only the companies the fund holds,
// so nothing marks an exit.

const ITEM = /<(a|button)\b([^>]*)\bclass="[^"]*\bportfolio-item\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
const HREF = /\bhref="([^"]*)"/;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
// "Aktis Logo", "Logo Aktis"
const LOGO_WORD = /^logo\s+|\s+logo$/gi;
const FORM = /[\s,]+(?:inc\.?|llc|ltd\.?|limited|corp\.?|ag|gmbh)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "Entrada Therapeutics, Inc." -> "Entrada Therapeutics"
const nameOf = (alt: string) => {
	const written = clean(alt).replace(LOGO_WORD, '').trim();
	return written.replace(FORM, '').trim() || written;
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	// what the page shows, without the markup it keeps commented out
	const html = (await resp.text()).replace(/<!--[\s\S]*?-->/g, '');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, , attrs, item] of html.matchAll(ITEM)) {
		const name = nameOf(item.match(ALT)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(attrs.match(HREF)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('mpmbioimpact: no companies on the portfolio page — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("mpmbioimpact: no logo links its company's site — the markup moved");
	}

	return companies;
}
