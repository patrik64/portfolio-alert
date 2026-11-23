import type { ScrapedCompany } from './types';

const BASE_URL = 'https://aicapital.ai';
// /our-companies/ has sent its visitors to /portfolio/ since the rebuild on 2026-11-21
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt, rendered on the server: the portfolio page is a numbered list, a row
// per company — its name (the alt text of its logo, or written out where
// there is none), where it is based ("Tel Aviv, Israel"), what it does, and a
// pill saying where the fund stands: "Active", "M&A · Apple · 2022" or
// "IPO · NASDAQ". a row is a link to the company's site, or, for most of the
// companies the fund is out of, links nowhere. the sectors the page filters
// by are fetched by the browser afterwards and are not in the page.
//
// the place is kept as a tag, an exit as "Acquired by Apple" or "IPO (HKEX)"
// with the Exited tag.
//
// a company renamed since it was stored is kept under the name it was stored
// as, so it is not taken for a new company ("Mallow", the children's audio
// device, was the Marshmallow Project).
const STORED_AS: Record<string, string> = {
	'envelop risk': 'Envelop Risk Analytics',
	mallow: 'Marshmallow Project'
};

const ROW = /<li>\s*<(a|div)\b([^>]*\bclass="row"[^>]*)>([\s\S]*?)<\/\1>\s*<\/li>/g;
const LOGO = /class="logo"[^>]*>\s*<img\b[^>]*\balt="([^"]*)"/;
const WRITTEN = /class="nm"[^>]*>([\s\S]*?)<\/span>/;
const HQ = /class="hq"[^>]*>([\s\S]*?)<\/small>/;
const PILL = /class="pill\b[^"]*"[^>]*>([\s\S]*?)<\/span>/;
const SITE = /\bhref="(https?:\/\/[^"]+)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "M&A · Apple · 2022" -> "Acquired by Apple", "IPO · HKEX" -> "IPO (HKEX)", "Active" -> ""
function exitOf(pill: string): string {
	const [kind = '', party = ''] = pill.split(/\s*·\s*/);
	const known = party && !/^undisclosed$/i.test(party) && !/^(?:19|20)\d{2}$/.test(party) ? tag(party) : '';
	if (/^m&a$|^acquired$/i.test(kind)) return known ? `Acquired by ${known}` : 'Acquired';
	if (/^ipo$|^listed$/i.test(kind)) return known ? `IPO (${known})` : 'IPO';
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, , attrs, row] of html.matchAll(ROW)) {
		const written = clean(row.match(LOGO)?.[1] ?? '') || clean(row.match(WRITTEN)?.[1] ?? '');
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const went = exitOf(clean(row.match(PILL)?.[1] ?? ''));
		const site = unescape(attrs.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [tag(row.match(HQ)?.[1] ?? ''), went, went ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('aic: no companies on the portfolio page');
	}

	return companies;
}
