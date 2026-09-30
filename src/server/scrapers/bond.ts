import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.bondcap.com/investments/';
const DATA_URL = 'https://www.bondcap.com/assets/data/investments/index.json';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// gridsome: the investments page is an empty shell that its script fills
// from the data file the build leaves beside it, at a fixed address. the
// file holds two lists the page shows one above the other: "Our
// Investments", the fund's own, and "Kleiner Perkins Digital Growth", the
// team's from the fund it grew out of, kept and tagged so. a company is a
// name, a logo and its site; how the fund got out is written into the
// name in brackets — a listing ("CLEAR (NYSE: YOU)") or a sale ("Brex
// (Capital One acquired)") — and is taken off it.

const LEGACY = 'Kleiner Perkins Digital Growth';
const BRACKET = /^(.*?)\s*\(([^()]*)\)\s*$/;
const LISTING = /^[A-Z]+\s*:\s*[A-Z0-9.]+$/;
const BOUGHT = /^(.+?)\s+acquired$/i;
const STEALTH = /^stealth\b/i;

interface Node {
	name?: string;
	url?: string;
}

interface Data {
	data?: {
		investments_bond?: { edges?: { node?: Node }[] };
		investments_kp?: { edges?: { node?: Node }[] };
	};
}

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

// the name as the fund writes it, and what its brackets say about an exit
function parse(written: string): { name: string; outcome: string } {
	const name = written.replace(/\s+/g, ' ').trim();
	const bracket = name.match(BRACKET);
	if (!bracket) return { name, outcome: '' };
	const [, bare, inner] = bracket;
	if (LISTING.test(inner.trim())) return { name: bare, outcome: `IPO (${tag(inner)})` };
	const bought = inner.trim().match(BOUGHT);
	if (bought) return { name: bare, outcome: `Acquired by ${tag(bought[1])}` };
	return { name, outcome: '' };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(DATA_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	const { data } = (await resp.json()) as Data;
	const lists: [Node[], string][] = [
		[(data?.investments_bond?.edges ?? []).map((e) => e.node ?? {}), ''],
		[(data?.investments_kp?.edges ?? []).map((e) => e.node ?? {}), LEGACY]
	];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [nodes, label] of lists) {
		for (const node of nodes) {
			const { name, outcome } = parse(node.name ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			// the sites are written without a scheme ("//akasa.com/")
			const site = (node.url ?? '').trim().replace(/^\/\//, 'https://');
			companies.push({
				name,
				category: [label, outcome, outcome ? 'Exited' : ''].filter(Boolean).join(', '),
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
	}
	if (companies.length === 0) {
		throw new Error('bond: no companies in the investments data');
	}

	return companies;
}
