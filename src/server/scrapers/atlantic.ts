import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://atlantic.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over datocms (the fund, once Atlantic Labs, is Atlantic now):
// the portfolio page shows a spotlight of six companies and a table of the
// rest, both drawn from lists in react's payload, a company each with its
// name, its sector ("AI & Compute", "Energy & Climate"), the countries it
// works from and its site. an exit is written into the name — "Apryl
// (Exited)" — and comes out of it into the Exited tag, so the name holds
// when the note goes. the sectors and the countries are kept as tags.
//
// the payload arrives as a run of javascript string literals that have to
// be unescaped and joined before the json inside them can be read.

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
// a list of companies: an array whose items open on an id and a logo
const LIST = /"(?:spotlight|data)":(?=\[\{"id":"[^"]+","logo":)/g;
const EXITED = /\s*\(\s*exited\s*\)\s*$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Company {
	name?: string;
	website?: string | null;
	sector?: { name?: string }[] | null;
	countries?: { name?: string }[] | null;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const payload = [...html.matchAll(CHUNK)].map(([, literal]) => JSON.parse(literal) as string).join('');
	const lists = [...payload.matchAll(LIST)]
		.map((match) => jsonAt(payload, match.index + match[0].length))
		.filter((list): list is Company[] => Array.isArray(list));
	if (lists.length === 0) {
		throw new Error("atlantic: the page's payload carries no portfolio lists — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of lists.flat()) {
		const written = clean(company?.name ?? '');
		const name = written.replace(EXITED, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = clean(company.website ?? '');
		companies.push({
			name,
			category: [
				...(company.sector ?? []).map((s) => tag(s?.name ?? '')),
				...(company.countries ?? []).map((c) => tag(c?.name ?? '')),
				EXITED.test(written) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('atlantic: the portfolio lists name no companies');
	}

	return companies;
}
