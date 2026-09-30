import type { ScrapedCompany } from './types';

const BASE_URL = 'https://645ventures.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the portfolio page is an empty shell that its scripts fill from
// a list of companies compiled into one of them — each with its name, its
// site, the stage the fund came in at, the year, its industries, as the
// slugs the filter keys on ("ai-infra-dev-tools") and spells out beside
// the list ("AI Infra / DevTools"), whether it was a small check and
// whether it is in stealth, and its standing: "Active", "Acquired",
// "IPO", "Liquidated", "Secondary Sale" or "645 Exited Position", all but
// the first the fund's way out. the scripts' names are hashed per build,
// so the shell is read for them each run and each is tried until the list
// is found.

const CHUNK = /<script\b[^>]*\bsrc="(\/_next\/static\/chunks\/[^"]+)"/g;
const LIST = /JSON\.parse\('(\[\{"id":"rec(?:[^'\\]|\\.)*)'\)/;
const LABEL = /\{label:"([^"]+)",slug:"([^"]+)"\}/g;
const STEALTH = /^stealth\b/i;

interface Record {
	name?: string;
	website?: string;
	stage?: string;
	status?: string;
	investment_date?: string;
	web_industry?: string[];
	small_check?: boolean;
	stealth?: boolean;
}

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// an industry the filter does not spell out: "vertical-saas" -> "Vertical Saas"
const spelled = (slug: string) => slug.split('-').filter(Boolean).map(capital).join(' ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// the list, out of the javascript string literal the build wrapped it
// in, and the filter's names for the industries
function listIn(script: string): { records: Record[]; labels: Map<string, string> } | null {
	const literal = script.match(LIST)?.[1];
	if (!literal) return null;
	const json = JSON.parse(`"${literal.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) as string;
	const labels = new Map([...script.matchAll(LABEL)].map(([, label, slug]) => [slug, label]));
	return { records: JSON.parse(json) as Record[], labels };
}

// how the fund got out, as the standing says; nothing for a company it holds
function exit(status: string): string {
	if (!status || /^active$/i.test(status)) return '';
	if (/^ipo$/i.test(status)) return 'IPO';
	return status.replace(/^645 exited position$/i, 'Exited Position');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(PAGE_URL);
	const chunks = [...new Set([...shell.matchAll(CHUNK)].map(([, src]) => src.replace(/&amp;/g, '&')))];
	let found: ReturnType<typeof listIn> = null;
	for (const chunk of chunks) {
		found = listIn(await fetchText(`${BASE_URL}${chunk}`));
		if (found) break;
	}
	if (!found) {
		throw new Error('645: no script on the portfolio page carries the list of companies');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const { records, labels } = found;
	for (const record of records) {
		const name = (record.name ?? '').replace(/\s+/g, ' ').trim();
		if (!name || record.stealth || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const went = exit(tag(record.status ?? ''));
		const year = String(record.investment_date ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = (record.website ?? '').trim();
		companies.push({
			name,
			category: [
				...(record.web_industry ?? []).map((slug) => tag(labels.get(slug) ?? spelled(slug))).filter((t) => !/^all$/i.test(t)),
				tag(record.stage ?? ''),
				year ? `Invested ${year}` : '',
				record.small_check ? 'Small Check' : '',
				went,
				went ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('645: no companies in the list');
	}

	return companies;
}
