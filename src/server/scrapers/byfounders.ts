import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://byfounders.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// tanstack start: the portfolio is drawn from the company list the page
// hydrates from, written into it as a seroval script ("$R[75]={id:...}").
// a company's record gives its name, its vertical ("Deep Tech", "Fintech"),
// its current stage ("Seed", "Series B", "Acquired"), its country, the date
// the fund first invested and its site, and whether it is announced. the
// page lists every company but those at the "Exit" stage, which it keeps
// for elsewhere, and shows an unannounced one as "Stealth"; neither is
// listed here. the vertical, the stage, the country and the year are kept
// as tags, an acquired company with the Exited tag in place of its stage.

const COMPANIES = /\bcompanies:\$R\[\d+\]=\[/;
// one token of the script: a string, a reference made ("$R[12]=") or used,
// a boolean, an undefined, a key, or any other character
const TOKEN = /"(?:[^"\\]|\\[\s\S])*"|\$R\[\d+\]=?|![01]|void 0|[A-Za-z_$][\w$]*(?=:)|[\s\S]/y;
const UNLISTED = /^exit$/i;
const ACQUIRED = /^acquired$/i;
const DOMAIN = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Company {
	name?: string;
	announced?: boolean;
	vertical?: string;
	stage?: string;
	geo?: string;
	initialDateInvested?: string;
	href?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the seroval array or object opening at start, read as json: references
// made are dropped, the booleans and keys written out and "\x3C" escapes
// written as json's; a reference used, which json cannot hold, fails it
function serovalAt(text: string, start: number): unknown {
	let json = '';
	let depth = 0;
	TOKEN.lastIndex = start;
	for (let token = TOKEN.exec(text); token; token = TOKEN.exec(text)) {
		const [t] = token;
		if (t.startsWith('"')) {
			json += t.replace(/\\(?:x([0-9a-f]{2})|[\s\S])/gi, (escape, hex) => (hex ? `\\u00${hex}` : escape));
		} else if (t.startsWith('$R[')) {
			if (!t.endsWith('=')) return undefined;
		} else if (t === '!0' || t === '!1') {
			json += t === '!0' ? 'true' : 'false';
		} else if (t === 'void 0') {
			json += 'null';
		} else if (/^[A-Za-z_$]/.test(t) && text[TOKEN.lastIndex] === ':') {
			json += JSON.stringify(t);
		} else {
			json += t;
			if (t === '[' || t === '{') depth++;
			else if ((t === ']' || t === '}') && --depth === 0) {
				try {
					return JSON.parse(json);
				} catch {
					return undefined;
				}
			}
		}
	}
	return undefined;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const at = html.match(COMPANIES);
	const records = at?.index !== undefined ? serovalAt(html, at.index + at[0].length - 1) : undefined;
	if (!Array.isArray(records)) {
		throw new Error('byfounders: the page carries no company list to read — the markup moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records as Company[]) {
		const name = clean(record.name ?? '');
		const stage = clean(record.stage ?? '');
		if (!record.announced || UNLISTED.test(stage)) continue;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = (record.initialDateInvested ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = clean(record.href ?? '');
		companies.push({
			name,
			category: [
				tag(record.vertical ?? ''),
				ACQUIRED.test(stage) ? '' : tag(stage),
				tag(record.geo ?? ''),
				year ? `Invested ${year}` : '',
				ACQUIRED.test(stage) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : DOMAIN.test(site) ? `https://${site}` : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('byfounders: no companies in the portfolio list');
	}

	return companies;
}
