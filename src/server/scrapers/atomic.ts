import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.atomic.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is a list of companies, each with the year
// it was founded, its stage ("Series B") or how the fund got out of it
// ("Acq by Dialpad", "NYSE: $HIMS"), and the categories the filter reads
// ("AI", "Real Estate"), opening a panel served in the page whose first
// link is the company's site. a sale is written out, "Acquired by
// Dialpad", and a listing kept as one, "IPO (NYSE: HIMS)". the stealth
// companies are counted by category only, and are not read.

const CARD = /(?=<div\b[^>]*\bmodal-trigger=")/;
const TRIGGER = /^<div\b[^>]*\bmodal-trigger="([^"]*)"/;
const CARD_END = 'class="list-item-bg"';
const NAME = /class="company-name"[^>]*>([\s\S]*?)<\/div>/;
const STAT = /<div class="stat-label">([\s\S]*?)<\/div>\s*<div>([\s\S]*?)<\/div>/g;
const CATEGORY = /fs-cmsfilter-field="category"[^>]*>([\s\S]*?)<\/div>/g;
const DIALOG = /<dialog\b[^>]*\bmodal="([^"]*)"[^>]*>([\s\S]*?)<\/dialog>/g;
// the panel's links sit in bare wrappers, the ones left empty hidden
const SITE = /<div>\s*<a\b[^>]*\bhref="(https?:\/\/[^"]*)"[^>]*\bclass="arrow-link\b/;
const SALE = /^acq(?:uired|\.)?\s+by\s+/i;
const LISTING = /^(nyse|nasdaq|lse|tsx|asx|hkex|euronext)\s*:?\s*\$?\s*([\w.]+)$/i;
const OUT = /^(?:ipo|acquired|merged|exited|public|shut down|closed)\b/i;
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
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "Acq by Navan" -> a sale, "NYSE: $HIMS" -> a listing, "Series B" -> a stage
function standing(stage: string): { label: string; out: boolean } {
	if (SALE.test(stage)) return { label: stage.replace(SALE, 'Acquired by '), out: true };
	const listed = stage.match(LISTING);
	if (listed) return { label: `IPO (${listed[1].toUpperCase()}: ${listed[2].toUpperCase()})`, out: true };
	return { label: stage, out: OUT.test(stage) };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const sites = new Map<string, string>();
	for (const [, modal, panel] of html.matchAll(DIALOG)) {
		const site = unescape(panel.match(SITE)?.[1] ?? '').trim();
		if (site) sites.set(modal, site);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(CARD).slice(1)) {
		const end = chunk.indexOf(CARD_END);
		const card = end < 0 ? chunk : chunk.slice(0, end);
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const stats = new Map([...card.matchAll(STAT)].map(([, label, value]) => [clean(label).toLowerCase(), tag(value)]));
		const founded = stats.get('founded')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const { label, out } = standing(stats.get('stage') ?? '');
		companies.push({
			name,
			category: [
				...[...card.matchAll(CATEGORY)].map(([, category]) => tag(category)),
				label,
				founded ? `Founded ${founded}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: sites.get(card.match(TRIGGER)?.[1] ?? '') ?? PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('atomic: no companies on the companies page');
	}

	return companies;
}
