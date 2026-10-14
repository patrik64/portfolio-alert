import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.silentvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a site of its own since the carrd page went in october 2026: the home
// page shows a handful of companies and /portfolio the rest, drawn in the
// browser from a list in the page's script, a company each, giving its
// name, its site, its sector ("Defense", "Space Tech"), the stage the fund
// came in at, the rounds it took part in and the group it is filed under —
// "Fund Investments", the founder's "Select Prior Investments", or "Exited
// Investments" with the way out ("Acquired", "by York Space Systems";
// "IPO", "NYSE: VOYG"). both the fund's companies and the earlier cheques
// are read, as before. the sector and the stage are kept as tags, an
// earlier cheque as "Prior Investment", a sale as "Acquired by …" and a
// listing as IPO, each with the Exited tag.

// the companies stored under the names the carrd page gave them, which the
// new site has changed: a moved name would read as a newcomer
const STORED_AS: Record<string, string> = {
	'Allen Control Systems': 'Allen Control Systems - Silent Ventures',
	'CHAOS Industries': 'CHAOS',
	Erebor: 'Erebor Bank',
	Harbinger: 'Harbinger Industries',
	'Kela Technologies': 'Kela',
	'Pilgrim Labs': 'Pilgrim',
	Privateer: 'Privateer Space'
};

const LIST = 'const DATA=[';
// the groups, by their place in the page's own list of them
const PRIOR = 1;
const EXITED = 2;
const ACQUIRED = /^acquired$/i;
const IPO = /^ipo$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Company {
	n?: string;
	u?: string;
	s?: string;
	e?: string;
	g?: number;
	o?: string[] | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the json value opening at start — an object or an array — up to its close
function jsonAt(text: string, start: number): unknown {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '{' || c === '[') depth++;
			else if ((c === '}' || c === ']') && --depth === 0) {
				try {
					return JSON.parse(text.slice(start, i + 1));
				} catch {
					return undefined;
				}
			}
		}
	}
	return undefined;
}

// the way out as tags: ["Acquired", "by York Space Systems"], ["IPO", "NYSE: VOYG"]
function wayOut([kind = '', detail = ''] = [] as string[]): string[] {
	const how = clean(kind);
	const buyer = clean(detail).replace(/^by\s+/i, '');
	if (ACQUIRED.test(how)) return [buyer ? `Acquired by ${tag(buyer)}` : '', 'Exited'];
	if (IPO.test(how)) return ['IPO', 'Exited'];
	return [tag(how), 'Exited'];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const at = html.indexOf(LIST);
	const list = at < 0 ? undefined : jsonAt(html, at + LIST.length - 1);
	if (!Array.isArray(list)) {
		throw new Error("silentvc: the page's script carries no portfolio list — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of list as Company[]) {
		const written = clean(company.n ?? '');
		if (!written || STEALTH.test(written)) continue;
		const name = STORED_AS[written] ?? written;
		if (seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const out = company.g === EXITED || (Array.isArray(company.o) && company.o.length > 0);
		const site = clean(company.u ?? '');
		companies.push({
			name,
			category: [
				tag(company.s ?? ''),
				tag(company.e ?? ''),
				company.g === PRIOR ? 'Prior Investment' : '',
				...(out ? wayOut(company.o ?? []) : [])
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('silentvc: the portfolio list names no companies');
	}

	return companies;
}
