import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.keenventurepartners.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page lists every company as a card, filtered in
// the browser by its status, "Active" or "Exit". a card opens to the
// company's name, a few lines about it — the round the fund invested in
// ("Series A", written "Serie B" once), the year it was established, its
// headquarters ("Paris, France"), its ceo and the partner on it — and a link
// to its site. the round, the place and the year are kept as tags, the
// place's parts as the fund writes them, and an exit with the Exited tag.

const CARD = /(?=<div role="listitem" class="w-dyn-item">)/;
const NAME = /class="card-company_details_name"[^>]*>\s*<div class="text-block">[^<]*<\/div>\s*<div>([\s\S]*?)<\/div>/;
const LOGO = /<img\b[^>]*\balt="([^"]*)"[^>]*\bclass="card-company_logo-image"/;
const DETAILS = /class="card-company_details_richt-text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="card-company_link\b/;
const STATUS = /class="card-company_status\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
// "Investment: Series A" — a label and its value, a line each
const LINE = /^\s*([^:]+?)\s*:\s*(.*?)\s*$/;
const EXIT = /^exit(?:ed)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ' '))
		.replace(/‍/g, '')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the card's lines, by their label in lower case
function fieldsOf(details: string): Map<string, string> {
	const fields = new Map<string, string>();
	for (const line of details.split(/<br\s*\/?>|<\/p>/i)) {
		const [, label, value] = clean(line).match(LINE) ?? [];
		if (label && value) fields.set(label.toLowerCase(), value);
	}
	return fields;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		// the status filter's own items share the list markup, without a company
		const name = clean(card.match(NAME)?.[1] ?? '') || clean(card.match(LOGO)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fields = fieldsOf(card.match(DETAILS)?.[1] ?? '');
		const year = fields.get('established')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const status = clean(card.match(STATUS)?.[1] ?? '');
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				tag(fields.get('investment') ?? ''),
				...(fields.get('hq') ?? '').split(',').map(tag),
				year ? `Founded ${year}` : '',
				EXIT.test(status) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('keen: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
