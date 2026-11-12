import type { ScrapedCompany } from './types';

const BASE_URL = 'https://spintopventures.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, since the move off wordpress on 2026-11-11: the portfolio page is
// one grid holding every company, a card each linking its page here
// ("./portfolio/velatir"), named in a layer of its own, and, for one the fund
// is out of, a pill saying how it went — "Acquired by Klarna, 2021", "IPO",
// "Exited, 2021". the pill is kept as "Acquired by …" or "IPO" beside the
// Exited tag; the year goes, and so does a deal's price ("in a USD 700M
// deal"). the "notable exits" row above the grid repeats five of the exits
// and is not read.
//
// the move shortened a few names the old site wrote out ("Aiba AS" is now
// "Aiba", "MariaDB Corporation" is "MariaDB"), and each is kept under the
// name it was stored as, so it is not taken for a new company.
const STORED_AS: Record<string, string> = {
	'3lc': 'Three Lines of Code 3LC',
	aiba: 'Aiba AS',
	alexishr: 'Alexis',
	mariadb: 'MariaDB Corporation',
	waya: 'Waya Finance & Technology'
};

const CARD = /<a\b[^>]*\bdata-framer-name="Portfolio item"[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /data-framer-name="Name"[^>]*>\s*<p\b[^>]*>([\s\S]*?)<\/p>/;
const PILL = /<span class="spt-pill[^"]*">([\s\S]*?)<\/span>/;
// "Acquired by Zynga in a USD 700M deal, 2018" -> "Zynga"
const BUYER = /^Acquired by\s+(.+?)(?:\s+in a\b.*?)?(?:,\s*(?:19|20)\d{2})?$/i;
const IPO = /^IPO\b/i;
const EXITED = /^Exited\b/i;
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
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

// a card's link is written relative to the page ("./portfolio/velatir"),
// and the company's page sits under /portfolio/ whatever the page's own
// address ends in
const pageOf = (href: string) => {
	const path = unescape(href).trim().replace(/^\.\//, '/');
	try {
		return path ? new URL(path, BASE_URL).href : PAGE_URL;
	} catch {
		return PAGE_URL;
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
	for (const [, href, card] of html.matchAll(CARD)) {
		const written = clean(card.match(NAME)?.[1] ?? '');
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const pill = clean(card.match(PILL)?.[1] ?? '');
		const buyer = pill.match(BUYER)?.[1];
		const ipo = IPO.test(pill);
		const exited = Boolean(buyer) || ipo || EXITED.test(pill);
		companies.push({
			name,
			category: [buyer ? `Acquired by ${tag(buyer)}` : '', ipo ? 'IPO' : '', exited ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: pageOf(href)
		});
	}

	if (companies.length === 0) {
		throw new Error('spintop: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
