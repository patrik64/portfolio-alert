import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://onevc.vc/';
// the portfolio as markdown, written from the same source as the pages
const PORTFOLIO_URL = 'https://onevc.vc/portfolio.md';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, since october 2026 (webflow before, on www, whose certificate the
// new host no longer covers): the home page's portfolio is a wall of logos
// linking a page per company, and the site publishes the whole of it as
// markdown besides, listed in its llms.txt — a heading per company under
// the site's four groups ("Fintech & Insurtech"), then its category,
// founding year, investment stage, headquarters and website, then prose.
// an exit is marked in the heading ("Rappi (Exit)"). the group, category,
// stage and headquarters are kept as tags, an exit with the Exited tag.

const GROUP = /^## (.+)$/;
const COMPANY = /^### (.+)$/;
const FIELD = /^- ([A-Za-z ]+):\s*(.*)$/;
const EXIT = /\s*\(exit\)\s*$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

// companies the site renamed after they were stored, kept under the stored
// names so the renames are not taken for new companies
const STORED_AS: Record<string, string> = {
	enter: 'Enter (formerly Talisman)',
	loopi: 'LoopiPay'
};

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "São Paulo, Brazil" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

interface Entry {
	name: string;
	exited: boolean;
	group: string;
	fields: Record<string, string>;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PORTFOLIO_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PORTFOLIO_URL}: ${resp.status}`);
	}
	const markdown = await resp.text();

	const entries: Entry[] = [];
	let group = '';
	for (const line of markdown.split('\n')) {
		const heading = line.match(GROUP);
		if (heading) {
			group = clean(heading[1]);
			continue;
		}
		const company = line.match(COMPANY);
		if (company) {
			const given = clean(company[1]);
			entries.push({ name: clean(given.replace(EXIT, '')), exited: EXIT.test(given), group, fields: {} });
			continue;
		}
		const field = line.match(FIELD);
		const current = entries[entries.length - 1];
		if (field && current) current.fields[clean(field[1]).toLowerCase()] = clean(field[2]);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { name: given, exited, group: inGroup, fields } of entries) {
		const name = STORED_AS[given.toLowerCase()] ?? given;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = fields.website ?? '';
		companies.push({
			name,
			category: [
				tag(inGroup),
				tag(fields.category ?? ''),
				tag(fields['investment stage'] ?? ''),
				tag(fields['head quarters'] ?? ''),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : fields['on the site'] || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('onevc: no companies in the portfolio markdown — the file moved');
	}

	return companies;
}
