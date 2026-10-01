import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.airstreet.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a page written by hand: the portfolio is a list for each of the fund's
// epochs ("Epoch III ('25-)", "Epoch II ('22-'25)", "Epoch I ('19-'22)"),
// and one of the investments made before it, "pre-Air Street", each line a
// company's name linking its site, then a few words about it and where it
// is. the epoch is kept as a tag without its years, and "pre-Air Street"
// as it is. how the fund got out is written after the name in brackets,
// "(acq. Amazon)" or a ticker, "(NASDAQ: RXRX)", kept as "Acquired by
// Amazon" and "IPO (NASDAQ: RXRX)". the ones named only "Unannounced" are
// left out, and a company listed under two headings takes both.

const SECTION = /(?=<div\b[^>]*\bclass="container has-text portfolio")/;
const HEADING = /<h\d\b[^>]*>([\s\S]*?)<\/h\d>/;
const LINE = /<li>\s*<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const NOTE = /\s*\(([^)]*)\)\s*$/;
const SALE = /^acq\.?\s+(.+)$/i;
const LISTING = /^(nasdaq|nyse|lse|tsx|asx|hkex|euronext)\s*:\s*\$?\s*([\w.]+)$/i;
const UNNAMED = /^(?:unannounced|stealth)\b/i;

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

// "acq. Amazon" -> "Acquired by Amazon", "NASDAQ: RXRX" -> "IPO (NASDAQ: RXRX)"
function outcome(note: string): string {
	const sale = note.match(SALE);
	if (sale) return `Acquired by ${tag(sale[1])}`;
	const listed = note.match(LISTING);
	if (listed) return `IPO (${listed[1].toUpperCase()}: ${listed[2].toUpperCase()})`;
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const found = new Map<string, { name: string; url: string; tags: string[] }>();
	for (const chunk of html.split(SECTION).slice(1)) {
		const section = chunk.slice(0, chunk.indexOf('</ul>') + 1 || undefined);
		// "Epoch III ('25-)" -> "Epoch III"
		const heading = tag(clean(section.match(HEADING)?.[1] ?? '').replace(NOTE, ''));
		for (const [, href, text] of section.matchAll(LINE)) {
			const written = clean(text);
			const note = written.match(NOTE)?.[1]?.trim() ?? '';
			const went = note ? outcome(note) : '';
			const name = went ? written.replace(NOTE, '').trim() : written;
			if (!name || UNNAMED.test(name)) continue;
			const site = unescape(href).trim();
			const company = found.get(name.toLowerCase()) ?? {
				name,
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL,
				tags: []
			};
			for (const label of [heading, went, went ? 'Exited' : '']) {
				if (label && !company.tags.includes(label)) company.tags.push(label);
			}
			found.set(name.toLowerCase(), company);
		}
	}
	if (found.size === 0) {
		throw new Error('airstreet: no companies on the portfolio page');
	}

	return [...found.values()].map(({ name, url, tags }) => ({
		name,
		// a sale or a listing reads after the epochs it was made in
		category: [...tags.filter((t) => t !== 'Exited'), ...(tags.includes('Exited') ? ['Exited'] : [])].join(', '),
		url
	}));
}
