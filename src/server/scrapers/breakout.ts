import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://breakout.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, the portfolio page served whole, in two parts. a showcase of a
// few companies: each a row with its name, followed by its panel with a line
// about it and a "Website" link. then the "Full Portfolio": a row a company,
// its logo linking its site and labelled "Visit X website", with a tagline
// and a few lines, and on one the fund is out of a status label ("EXITED
// Acquired by Halozyme (HALO)") or an outcome between asterisks at the end
// of the tagline ("*IPO 2019*"). the page writes the names as the fund types
// them ("ZymoChem", "STRM.BIO"), where the page before it printed capitals.
// the outcome is kept as a tag, with Exited. every row comes twice, once a
// breakpoint, and is read once; the class names carry a build hash and are
// matched up to it. the site's content lists a company or two the page
// leaves out (one without a picture), and the page decides.
//
// the page before october 2026 printed every name in capitals and the
// companies were stored under the fund's spelling of the time, taken from
// its content; two it writes otherwise now are stored under the old
// spelling so they do not come up as new.

const ROW = /(?=<button type="button" class="portfolio-showcase_row__)/;
const ROW_NAME = /portfolio-showcase_rowName__[\w-]+"[^>]*>([^<]*)</;
const ROW_SITE = /portfolio-showcase_detailLink__[\w-]+"[^>]*\bhref="([^"]*)"/;
const CARD = /(?=<div class="additional-companies_row__)/;
const CARD_NAME = /aria-label="Visit (.*?) website"/;
const CARD_SITE = /<a\b[^>]*additional-companies_imageWrap__[\w-]+"[^>]*\bhref="([^"]*)"/;
const TAGLINE = /additional-companies_tagline__[\w-]+"[^>]*>([\s\S]*?)<\/span>/;
// the label's spans — a dot, "EXITED", the rest — run up to the tagline
const STATUS = /additional-companies_statusLabel__[\w-]+"[^>]*>([\s\S]*?)<span class="additional-companies_tagline/;
const EXITED = /\bexited\b/i;
const OUTCOME = /\*([^*]+)\*\s*$/;
const STEALTH = /^stealth\b/i;

// the fund's spelling now, and the one the company is stored under
const STORED_AS: Record<string, string> = {
	EnPlusOne: 'Enplusone Bio',
	Epana: 'Epana Bio'
};

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// how an exit went, from the status label ("🟢 EXITED Acquired by Halozyme
// (HALO)") or the asterisks closing the tagline ("*IPO 2019*")
function outcomeOf(status: string, tagline: string): string {
	const said = status.replace(EXITED, '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '');
	return tag(said || tagline.match(OUTCOME)?.[1] || '');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (written: string, site: string, category: string) => {
		const name = STORED_AS[written] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		companies.push({ name, category, url: /^https?:\/\//i.test(site) ? site : PAGE_URL });
	};

	// the showcase: a row's name, and the site its panel links
	for (const row of html.split(ROW).slice(1)) {
		add(clean(row.match(ROW_NAME)?.[1] ?? ''), unescape(row.match(ROW_SITE)?.[1] ?? '').trim(), '');
	}
	// the full portfolio: a card's label names it, its logo links the site
	for (const card of html.split(CARD).slice(1)) {
		const status = clean(card.match(STATUS)?.[1] ?? '');
		const tagline = clean(card.match(TAGLINE)?.[1] ?? '');
		const exited = EXITED.test(status) || OUTCOME.test(tagline);
		add(
			clean(card.match(CARD_NAME)?.[1] ?? ''),
			unescape(card.match(CARD_SITE)?.[1] ?? '').trim(),
			[exited ? outcomeOf(status, tagline) : '', exited ? 'Exited' : ''].filter(Boolean).join(', ')
		);
	}

	if (companies.length === 0) {
		throw new Error('breakout: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
