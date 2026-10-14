import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.moonfire.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over sanity: the portfolio page is a grid of logos, the fund's
// companies, and below it the partners' "Prior Investments" (Klarna,
// Supercell), both drawn from lists in react's payload. an entry gives the
// company's slug, its site, its sectors ("Work & Knowledge"), where it is
// based, the year it was founded, sometimes the year the fund backed it,
// and a description — but never the company's name: the page shows a
// logo, and the panel a card opens shows the logo again.
//
// so the name is read from the description, which opens with it as a rule
// ("All Gravy is re-engineering salary…", "MAIHEM creates AI agents…"):
// the first words there that spell the slug, the slug without a trailing
// "-ai" or "-io", a part of it ("hibob-pento-io" is "Pento"), or the
// site's own name ("nuephonic" is Neuphonic at neuphonic.com). failing
// all of them, the site's name or the slug is written out in words.
//
// the sectors, the place, the years and, for the partners' earlier
// cheques, "Prior Investment" are kept as tags. a company without a site
// links its card here.
//
// the payload arrives as a run of javascript string literals that have to
// be unescaped and joined before the json inside them can be read.

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const FUND_LIST = '"portfolioData":[';
const PRIOR_LIST = '"notableInvestments":[';
// a slug's trailing words that a description may leave off the name
const GENERIC = /-(?:ai|io|app|hq|labs?|health|games?|entertainment|therapeutics|technologies|tech)$/;
const YEAR = /^(?:19|20)\d{2}$/;
// a word as a name may be written: "Lingo.dev", "Qu&Co", "Healthtech 1"
const WORD = /[\p{L}\p{N}][\p{L}\p{N}.&'’+-]*/gu;
const UNSAID = /^(?:-|other|others|all|n\/?a)$/i;
const STEALTH = /^stealth\b/i;

interface Block {
	children?: { text?: string }[];
}

interface Entry {
	slug?: string;
	website?: string | null;
	shortDesc?: string | null;
	description?: Block[] | null;
	sectors?: { name?: string }[] | null;
	headquarters?: string | null;
	foundedAt?: number | string | null;
	backedAt?: number | string | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const spelled = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// "stack-auth" -> "Stack Auth"
const inWords = (s: string) =>
	s
		.split(/[-_]+/)
		.filter(Boolean)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');

// the site's own name: "https://www.neuphonic.com/" -> "neuphonic"
const hostName = (site: string) =>
	site
		.replace(/^https?:\/\/(?:www\.|en\.)?/i, '')
		.split(/[/?#]/)[0]
		.split('.')[0];

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

function listAt(payload: string, key: string): Entry[] | undefined {
	const at = payload.indexOf(key);
	const list = at < 0 ? undefined : jsonAt(payload, at + key.length - 1);
	return Array.isArray(list) ? (list as Entry[]) : undefined;
}

// the company's name as its description writes it — see above
function nameOf(entry: Entry): string {
	const slug = clean(entry.slug ?? '').toLowerCase();
	const site = clean(entry.website ?? '');
	const text = [
		...(entry.description ?? []).map((block) => (block?.children ?? []).map((c) => c?.text ?? '').join('')),
		entry.shortDesc ?? ''
	].join(' ');
	const words = text.match(WORD) ?? [];
	const keys = [
		spelled(slug),
		spelled(slug.replace(GENERIC, '')),
		...slug.split('-').filter((part) => part.length >= 4),
		site ? spelled(hostName(site)) : ''
	].filter((key, i, all) => key && all.indexOf(key) === i);
	for (const key of keys) {
		for (let i = 0; i < words.length; i++) {
			for (let n = 1; n <= 4 && i + n <= words.length; n++) {
				const phrase = words
					.slice(i, i + n)
					.join(' ')
					.replace(/[.,;:]+$/, '')
					.replace(/['’]s$/, '');
				if (spelled(phrase) === key) return phrase;
			}
		}
	}
	const host = site ? hostName(site) : '';
	return inWords(host && spelled(host) === spelled(slug) ? host : slug);
}

function companyOf(entry: Entry, prior: boolean): ScrapedCompany {
	const year = (value: unknown) => (YEAR.test(String(value ?? '')) ? String(value) : '');
	const founded = year(entry.foundedAt);
	const backed = year(entry.backedAt);
	const site = clean(entry.website ?? '');
	return {
		name: nameOf(entry),
		category: [
			...(entry.sectors ?? []).map((sector) => tag(sector?.name ?? '')),
			...(entry.headquarters ?? '').split(',').map(clean),
			founded ? `Founded ${founded}` : '',
			backed ? `Invested ${backed}` : '',
			prior ? 'Prior Investment' : ''
		]
			.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
			.join(', '),
		url: /^https?:\/\//i.test(site) ? site : `${PAGE_URL}?company=${encodeURIComponent(entry.slug ?? '')}`
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const payload = [...html.matchAll(CHUNK)].map(([, literal]) => JSON.parse(literal) as string).join('');
	const fund = listAt(payload, FUND_LIST);
	if (!fund) {
		throw new Error("moonfire: the page's payload carries no portfolio list — the page moved");
	}
	// the partners' earlier cheques, a section the page may drop
	const prior = listAt(payload, PRIOR_LIST) ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [entries, isPrior] of [
		[fund, false],
		[prior, true]
	] as const) {
		for (const entry of entries) {
			if (!entry?.slug) continue;
			const company = companyOf(entry, isPrior);
			if (STEALTH.test(company.name) || seen.has(company.name.toLowerCase())) continue;
			seen.add(company.name.toLowerCase());
			companies.push(company);
		}
	}

	if (companies.length === 0) {
		throw new Error('moonfire: the portfolio list names no companies');
	}

	return companies;
}
