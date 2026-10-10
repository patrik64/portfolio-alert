import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.project-a.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, streamed: the companies page lists every company as a row the
// visitor can open — its name, a line about it, the stage the fund came in
// at and whether the fund is still in ("Active") or out ("Exited"), and,
// opened, the year it was founded, its headquarters, its site, its industry
// ("AI & Data Infrastructure") and a description, which on an exit often
// says who bought it ("acquired by Similarweb in 2024", "adquired" even).
// the industry, the stage, the city and the year are kept as tags. the page
// streams its rows in pieces: a row's place is a template, filled later from
// a hidden segment ("P:12" from "S:12"), and a row may hold templates of its
// own, so each row is read with its templates filled in.

const ROW = '<div data-type="portfolio-company"';
const SEGMENT = /<div hidden id="S:([0-9a-f]+)">([\s\S]*?)<\/div><script>\$RS\("S:\1"/g;
const TEMPLATE = /<template id="P:([0-9a-f]+)"><\/template>/g;
const NAME = /<h3[^>]*>([\s\S]*?)<\/h3>/;
const STATUS = /<span[^>]*\bdata-test="([^"]*)"/;
// a labelled fact: "<span>HQ</span><span>Berlin</span>"
const FACT = /<p[^>]*><span[^>]*>([^<]*)<\/span>(?:<span[^>]*>([\s\S]*?)<\/span>|<a\b[^>]*\bhref="([^"]*)")/g;
const ABOUT = /<p[^>]*>\s*<!-- -->([\s\S]*?)<!-- -->\s*<\/p>/;
// "acquired by Similarweb in 2024", the fund's own "adquired" too
const BUYER = /\ba[cd]quired by ([A-Z][^.,;()]*?)(?=\s+(?:in|for|to|and|as|which)\b|[.,;()]|$)/i;
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|unknown)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the div that opens at start, up to its own closing tag
function divAt(html: string, start: number): string {
	const tags = /<div\b|<\/div>/g;
	tags.lastIndex = start;
	let depth = 0;
	for (let m = tags.exec(html); m; m = tags.exec(html)) {
		depth += m[0] === '</div>' ? -1 : 1;
		if (depth === 0) return html.slice(start, m.index + m[0].length);
	}
	return html.slice(start);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// what each template is filled with, filled in as deep as it goes
	const segments = new Map([...html.matchAll(SEGMENT)].map(([, id, body]) => [id, body]));
	const filled = (fragment: string, depth = 0): string =>
		depth > 5 ? fragment : fragment.replace(TEMPLATE, (whole, id) => filled(segments.get(id) ?? '', depth + 1));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (let at = html.indexOf(ROW); at >= 0; at = html.indexOf(ROW, at + ROW.length)) {
		const row = filled(divAt(html, at));
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const facts = new Map<string, string>();
		for (const [, label, value, href] of row.matchAll(FACT)) {
			const key = clean(label).toLowerCase();
			if (!facts.has(key)) facts.set(key, href ? unescape(href).trim() : clean(value ?? ''));
		}
		const out = EXITED.test(clean(row.match(STATUS)?.[1] ?? ''));
		const buyer = out ? (clean(row.match(ABOUT)?.[1] ?? '').match(BUYER)?.[1]?.trim() ?? '') : '';
		const site = facts.get('website') ?? '';
		if (/^https?:\/\//i.test(site)) withSite++;
		const fact = (label: string) => {
			const value = facts.get(label) ?? '';
			return UNSAID.test(value) ? '' : tag(value);
		};
		const founded = facts.get('founded')?.match(/\b(?:19|20)\d{2}\b/)?.[0];

		companies.push({
			name,
			category: [
				fact('industry'),
				fact('entry stage'),
				fact('hq'),
				founded ? `Founded ${founded}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('projecta: no companies on the companies page');
	}
	// were the rows' facts to move, every company would come in bare
	if (withSite === 0) {
		throw new Error("projecta: no company row gives its site — the row's markup moved");
	}

	return companies;
}
