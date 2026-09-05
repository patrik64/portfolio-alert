import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://root.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a terminal: the portfolio is what "tldr" prints, drawn by
// xterm.js from a table the page's script holds. none of that has to be driven,
// because the page also states the same companies as structured data for search
// engines — one Organization per company, the fund named as its funder, with
// the company's own address. the terminal's tldr topics and these entries are
// the same set, company for company.
//
// the fund publishes no sectors and marks no exits, so categories are empty.

const LD_JSON = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

interface Node {
	'@type'?: string;
	'@id'?: string;
	name?: string;
	url?: string;
	funder?: { '@id'?: string };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const nodes: Node[] = [];
	for (const [, block] of html.matchAll(LD_JSON)) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(block);
		} catch {
			continue;
		}
		const graph = (parsed as { '@graph'?: Node[] })?.['@graph'];
		nodes.push(...(graph ?? (Array.isArray(parsed) ? (parsed as Node[]) : [parsed as Node])));
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const node of nodes) {
		// the fund states itself and its people in the same graph; a portfolio
		// company is the one it says it funds
		if (node['@type'] !== 'Organization') continue;
		if (!node.funder?.['@id']) continue;
		const name = (node.name ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: (node.url ?? '').trim() });
	}

	if (companies.length === 0) {
		throw new Error('rootvc: no companies in the page data');
	}

	return companies;
}
