import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.brandenburg-kapital.de/de/bk/portfolio.html';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a teaser per company, whose details open in place: the name with its legal form,
// linked to its site, a line about it and a few fields in german. "Sitz" is the
// seat, "Status" reads "Investment seit 2026" (spelt a few ways) or "Exit 2022" or
// "Verkauf 2018", "Exitstruktur" says how it was sold, as "Trade Sale". the logo of
// one the fund is out of carries a stamp.
const CARD = /(?=class="c-teaser-company")/;
const NAME = /class="c-heading__title"[^>]*>\s*(?:<a\b[^>]*\bhref="([^"]*)"[^>]*>)?([\s\S]*?)<\/(?:a|h2)>/;
const FIELD =
	/class="c-teaser-company__item-label"[^>]*>([^<]*)<\/h3>\s*<span class="c-teaser-company__item-content"[^>]*>([\s\S]*?)<\/span>/g;
const EXIT_STAMP = 'class="c-teaser-company__exit"';
const YEAR = /\b(\d{4})\b/;
const SOLD = /^\s*(?:exit|verkauf)/i;
// "Generation Reach GmbH (family.cards)", "Bier-Deluxe GmbH", "X GmbH & Co. KG"
const NOTE = /\s*\([^)]*\)$|\s+GmbH\s+[-–]\s.*$|\s+[-–]\s+Gesellschaft\b.*$/;
const LEGAL_FORM =
	/,?\s+(?:gmbh\s*(?:&|&amp;|und)\s*co\.?\s*kg(?:aa)?|gmbh|ug(?:\s*\(haftungsbeschr[^)]*\))?|ag|se|kg|mbh|ltd\.?|inc\.?|llc|b\.?v\.?)\.?$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const nameOf = (shown: string) => clean(shown).replace(NOTE, '').replace(LEGAL_FORM, '').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const cards = (await resp.text()).split(CARD).slice(1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const [, href = '', shown = ''] = card.match(NAME) ?? [];
		const name = nameOf(shown);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fields = new Map([...card.matchAll(FIELD)].map(([, label, value]) => [clean(label), clean(value)]));
		const status = fields.get('Status') ?? '';
		const out = card.includes(EXIT_STAMP) || SOLD.test(status);
		companies.push({
			name,
			category: [
				tag(fields.get('Sitz') ?? ''),
				out ? '' : (status.match(YEAR)?.[1] ?? ''),
				tag(fields.get('Exitstruktur') ?? ''),
				out ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//.test(href) ? href.trim() : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('brandenburg: no companies on the portfolio page');
	}

	return companies;
}
