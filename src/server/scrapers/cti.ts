import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.ctisciences.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a grid of logos, each marked active,
// exited or other, linking a page per company on the fund's site. that
// page has a paragraph about the company and labelled facts — its
// specialty ("Pancreatic cancer"), the fund, the round the fund came in
// at, the date and an "Exit Detail" that reads "Active" or how it went —
// but never the name in a heading nor a link to a site. so the names are
// kept here by the page's slug, one not yet known read off its slug, and
// the pages are fetched for the facts; a company links to its page.

const CARD = /<div[^>]*\bcompany-type="([^"]*)"[^>]*class="company__card w-dyn-item"[^>]*>\s*<a\b[^>]*\bhref="\/companies\/([^"#?]+)"/g;
const FACT = /<h\d class="company__sub-headings">([\s\S]*?)<\/h\d>\s*<p class="company__sub-header-value">([\s\S]*?)<\/p>/g;
const EXITED = /\b(?:acquired|merged|ipo|public|exited|listed)\b/i;
const STEALTH = /^stealth\b/i;

const NAMES: Record<string, string> = {
	'ability-pharma': 'Ability Pharma',
	'aeovian-pharmaceuticals': 'Aeovian Pharmaceuticals',
	'amolyt-pharma': 'Amolyt Pharma',
	cellaegis: 'CellAegis',
	'cervelo-pharmaceuticals': 'Cervelo Pharmaceuticals',
	'chlorion-pharma': 'Chlorion Pharma',
	'dalcor-pharmacheuticals': 'Dalcor Pharmaceuticals',
	engene: 'enGene',
	enobia: 'Enobia Pharma',
	epitopea: 'Epitopea',
	'find-therapeutics': 'Find Therapeutics',
	glycomine: 'Glycomine',
	glypharma: 'GlyPharma',
	ilkos: 'Ilkos Therapeutic',
	imv: 'IMV',
	'kainova-therapeutics': 'Kainova Therapeutics',
	medicago: 'Medicago',
	neuraxon: 'Neuraxon',
	'oligon-rna-therapeutics': 'Oligon RNA Therapeutics',
	phemi: 'PHEMI',
	'phenomic-ai': 'Phenomic AI',
	precithera: 'Precithera',
	'profound-medical': 'Profound Medical',
	'somnus-therapeutics': 'Somnus Therapeutics',
	targegen: 'TargeGen',
	'thryv-therapeutics': 'Thryv Therapeutics',
	vaxcyte: 'Vaxcyte',
	vectivbio: 'VectivBio',
	visterra: 'Visterra',
	xagenisc: 'Xagenic',
	'xtuit-pharmaceuticals': 'Xtuit Pharmaceuticals',
	zymeworks: 'Zymeworks'
};

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a name read off a slug, for a company not yet known: "new-co" is New Co
const slugName = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the facts a company's page states, by their labels, or none when the page
// will not load
async function factsOf(page: string): Promise<Map<string, string>> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return new Map();
		return new Map([...(await resp.text()).matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)]));
	} catch {
		return new Map();
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const cards = [...html.matchAll(CARD)].map(([, type, slug]) => ({ type: clean(type), slug: unescape(slug) }));
	if (cards.length === 0) {
		throw new Error('cti: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, card] of cards.entries()) {
		const name = NAMES[card.slug] ?? slugName(card.slug);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const page = `${BASE_URL}/companies/${card.slug}`;
		if (i > 0) await wait(PACE_MS);
		const facts = await factsOf(page);
		const detail = facts.get('exit detail') ?? '';
		// "Active", or "n/a" where the fund has written nothing, is no outcome
		const outcome = /^(?:active|n\/a|-)$/i.test(detail) ? '' : detail;
		const year = facts.get('investment date')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const exited = /^exited$/i.test(card.type) || EXITED.test(outcome);
		companies.push({
			name,
			category: [
				tag(facts.get('specialty') ?? ''),
				tag(facts.get('fund name') ?? ''),
				tag(facts.get('initial series round') ?? ''),
				year ? `Invested ${year}` : '',
				outcome ? tag(outcome) : '',
				exited ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: page
		});
	}

	return companies;
}
