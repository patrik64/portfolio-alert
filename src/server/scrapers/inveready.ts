import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://inveready.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of logos, the whole of it in the
// page — "load more" only shows the ones it hides — a logo a company whose
// drawer is filled from a record the logo carries: its name, its site, its
// page here and its facts, its status ("Active", "Exited"), the firm's
// platforms it sits in ("Venture", "Life Sciences", "Private Equity",
// "Infrastructure"), at times its fund ("Inveready Biotech II") and the
// year the firm invested. a name is the company's registered one at times
// ("Arcure S.A") or carries a note in brackets ("Mediasquare
// (Sweetspot)"); the legal form and the note are not part of it. the
// platforms, the fund and the year are kept as tags, an exit with the
// Exited tag.

const RECORD = /\bdata-portfolio-detail="([^"]*)"/g;
const NOTE = /\s*\([^()]*\)\s*$/;
const FORM = /[\s,]+(?:s\.?\s?a\.?|s\.?\s?l\.?(?:u\.?)?|inc\.?|ltd\.?|gmbh)$/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
const EXITED = /^exit(?:ed)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
const STEALTH = /^stealth\b/i;

interface Fact {
	label?: string;
	value?: string;
}

interface Entry {
	title?: string;
	url?: string;
	permalink?: string;
	fields?: Fact[];
}

// an attribute's text, its entities undone: &#x7B;&quot;title&quot;… -> {"title"…
const decode = (s: string) =>
	s
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');

const clean = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "Arcure S.A" -> "Arcure", "Mediasquare (Sweetspot)" -> "Mediasquare"
function nameOf(written: string): string {
	let name = written;
	for (let before = ''; before !== name; ) {
		before = name;
		name = name.replace(NOTE, '').replace(FORM, '').trim();
	}
	return name || written;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, attribute] of html.matchAll(RECORD)) {
		let record: Entry;
		try {
			record = JSON.parse(decode(attribute));
		} catch {
			continue;
		}
		const name = nameOf(clean(record.title ?? ''));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fact = (label: string) =>
			clean((record.fields ?? []).find((f) => clean(f.label ?? '').toLowerCase() === label)?.value ?? '');
		const status = fact('status');
		const year = fact('year invested').match(YEAR)?.[0];
		const site = clean(record.url ?? '');
		if (/^https?:\/\//i.test(site)) withSite++;
		const page = clean(record.permalink ?? '');
		companies.push({
			name,
			category: [
				...fact('platform').split(',').map(tag),
				...fact('fund').split(',').map(tag),
				year ? `Invested ${year}` : '',
				EXITED.test(status) ? 'Exited' : tag(status)
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : /^https?:\/\//i.test(page) ? page : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('inveready: no companies in the portfolio grid — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("inveready: no company's record gave its site — the grid's markup moved");
	}

	return companies;
}
