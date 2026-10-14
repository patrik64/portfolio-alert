import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.kennet.com/';
const PORTFOLIO_URL = `${PAGE_URL}#portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the portfolio is a section of the home page, two lists drawn
// from react's payload — the current portfolio, each company's name, its
// sector ("Contract Lifecycle Management") and a line about it, and the
// exited investments, adding the fund it came from ("Kennet III") and its
// buyer. the sector is kept as a tag, an exit's fund and buyer as "Kennet
// IV" and "Acquired by …" with the Exited tag. the lists give no company's
// site, so a company links the section.
//
// the payload arrives as a run of javascript string literals that have to
// be unescaped and joined before the json inside them can be read.

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const CURRENT = '"investments":[{"id":';
const EXITS = '"exits":[{"id":';
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Investment {
	companyName?: string;
	sector?: string;
	websiteUrl?: string;
	acquirer?: string;
	fund?: string;
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

function listAt(payload: string, key: string): Investment[] | undefined {
	const at = payload.indexOf(key);
	const list = at < 0 ? undefined : jsonAt(payload, at + key.indexOf('['));
	return Array.isArray(list) ? (list as Investment[]) : undefined;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const payload = [...html.matchAll(CHUNK)].map(([, literal]) => JSON.parse(literal) as string).join('');
	const current = listAt(payload, CURRENT);
	const exits = listAt(payload, EXITS);
	// a part of the portfolio must not pass for the whole
	if (!current || !exits) {
		throw new Error("kennet: the page's payload carries no portfolio lists — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [list, exited] of [
		[current, false],
		[exits, true]
	] as const) {
		for (const investment of list) {
			const name = clean(investment?.companyName ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const buyer = clean(investment.acquirer ?? '');
			const site = clean(investment.websiteUrl ?? '');
			companies.push({
				name,
				category: [
					tag(investment.sector ?? ''),
					tag(investment.fund ?? ''),
					buyer ? `Acquired by ${tag(buyer)}` : '',
					exited ? 'Exited' : ''
				]
					.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(site) ? site : PORTFOLIO_URL
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('kennet: the portfolio lists name no companies');
	}

	return companies;
}
