import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.hcvc.co/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a one-page site since october 2026 (a table at /pages/portfolio before):
// the page's script draws the portfolio from its content, written into the
// page whole at build time as `const CONTENT = {…}` — a company each with
// its site, sector ("Robotics"), the year the fund came in, the round,
// its country as a two-letter code, and whether it was acquired and by
// whom. a company still in stealth is named "Stealth" and is left out; the
// catch-all "Other" sector is not kept as a tag.

const CONTENT = /\bconst CONTENT\s*=\s*/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

// a company the site renamed after it was stored, kept under the stored
// name so the rename is not taken for a new company
const STORED_AS: Record<string, string> = {
	'dyna robotics': 'Dyna'
};

interface Entry {
	name?: unknown;
	url?: unknown;
	sector?: unknown;
	year?: unknown;
	round?: unknown;
	country?: unknown;
	acquired?: unknown;
	acquiredBy?: unknown;
}

const countries = new Intl.DisplayNames(['en'], { type: 'region' });

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: unknown) => clean(s).replace(/\s*,\s*/g, ' / ');

// "FR" -> "France"; the site writes the united kingdom "UK", not "GB"
function country(code: string): string {
	const iso = code.toUpperCase() === 'UK' ? 'GB' : code.toUpperCase();
	if (!/^[A-Z]{2}$/.test(iso)) return code;
	try {
		return countries.of(iso) ?? code;
	} catch {
		return code;
	}
}

// the JSON object that starts at `from`, read to its closing brace
function objectAt(text: string, from: number): unknown {
	let depth = 0;
	let inString = false;
	for (let i = from; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (ch === '\\') i++;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '{' || ch === '[') depth++;
		else if (ch === '}' || ch === ']') {
			if (--depth === 0) return JSON.parse(text.slice(from, i + 1));
		}
	}
	throw new Error('hcvc: the content object in the page never closes');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const at = html.search(CONTENT);
	if (at < 0) {
		throw new Error('hcvc: no content object in the page — the site moved');
	}
	const content = objectAt(html, html.indexOf('{', at)) as { companies?: { companies?: unknown } };
	const rows = content.companies?.companies;
	if (!Array.isArray(rows)) {
		throw new Error('hcvc: the content holds no list of companies — the site moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows as Entry[]) {
		const given = clean(row.name);
		const name = STORED_AS[given.toLowerCase()] ?? given;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sector = tag(row.sector);
		const where = clean(row.country);
		const year = clean(row.year).match(/^(?:19|20)\d{2}$/)?.[0];
		const buyer = tag(row.acquiredBy);
		const acquired = row.acquired === true || Boolean(buyer);
		const site = clean(row.url);
		companies.push({
			name,
			category: [
				UNSAID.test(sector) ? '' : sector,
				tag(row.round),
				where ? tag(country(where)) : '',
				year ? `Invested ${year}` : '',
				acquired ? (buyer ? `Acquired by ${buyer}` : 'Acquired') : '',
				acquired ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('hcvc: no companies in the page content');
	}

	return companies;
}
