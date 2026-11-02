import type { ScrapedCompany } from './types';

const SITE = 'https://www.climate-kic.org';
const PORTFOLIO_URL = `${SITE}/programmes/our-portfolio/`;
const MEMBERS_URL = `${SITE}/wp-json/wp/v2/partners`;
const MEMBER_TYPES_URL = `${SITE}/wp-json/wp/v2/partners_type_taxonomy?per_page=100`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 30;
const MEMBERS_PER_PAGE = 100;

// wordpress, with two lists. the portfolio is the startups the accelerators took
// equity in, a dozen to a page: a row per company linking its site, with its country,
// sector, year and programme. the members are the community, cities and universities
// as much as businesses, tagged Member here to tell them from the startups: their page
// truncates the long names and links only to a page of the site's own, so they are
// read from the site's rest api instead, one request for all of them, the address in
// the text of each. a member's type comes from the same terms the "Drive members" of
// the page are filed under; the other members of that post type are past ones.
const CURRENT_MEMBERS = 'drive-members';
const NOT_A_TYPE = new Set([CURRENT_MEMBERS, 'challenge-owner', 'co-designer']);

const ROW =
	/<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*<div class="relative flex flex-col[^"]*"[\s\S]*?<h3 class="text-38sn[^"]*">([\s\S]*?)<\/h3>([\s\S]*?)<\/a>/g;
const TAG = /<span class="bg-daffodil[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
const LINK = /\bhref="(https?:\/\/[^"]+)"/g;
const NOT_THE_MEMBER = /\/\/(?:[\w-]+\.)*(?:climate-kic\.org|linkedin\.com|twitter\.com|x\.com|facebook\.com|youtube\.com)\b/i;
const NO_PROGRAMME = /^other$/i;
// "AGROVAR CC Ltd.", "Bluana Foods SRL"
const LEGAL_FORM = /,?\s+(?:ltd|limited|srl|s\.r\.l|sl|s\.l|gmbh|bv|b\.v|ab|ag|sa|s\.a|oy|inc|llc|doo|d\.o\.o)\.?$/i;
// "Volvero (Wego srl)" names its legal entity; "EnergyBlind (Enerlind)" another name
const LEGAL_ENTITY = /\s*\([^)]*\b(?:ltd|srl)\.?\)$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const nameOf = (shown: string) => clean(shown).replace(LEGAL_ENTITY, '').replace(LEGAL_FORM, '').trim();

async function read(url: string): Promise<Response> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp;
}

async function readPortfolio(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const html = await (await read(page === 1 ? PORTFOLIO_URL : `${PORTFOLIO_URL}?sf_paged=${page}`)).text();
		const rows = [...html.matchAll(ROW)];
		if (rows.length === 0) break;
		for (const [, href, shown, rest] of rows) {
			const tags = [...rest.matchAll(TAG)].map(([, label]) => tag(label));
			const [country = '', sector = '', year = '', programme = ''] = tags;
			companies.push({
				name: nameOf(shown),
				category: [sector, country, year, NO_PROGRAMME.test(programme) ? '' : programme].filter(Boolean).join(', '),
				url: /^https?:\/\//.test(href) ? href.trim() : ''
			});
		}
	}
	return companies;
}

interface Member {
	title?: { rendered?: string };
	content?: { rendered?: string };
	partners_type_taxonomy?: number[];
}

async function readMembers(): Promise<ScrapedCompany[]> {
	const terms = (await (await read(MEMBER_TYPES_URL)).json()) as { id: number; slug: string; name: string }[];
	const current = terms.find(({ slug }) => slug === CURRENT_MEMBERS)?.id;
	if (!current) throw new Error(`climatekic: no "${CURRENT_MEMBERS}" among the member types`);
	const typeOf = new Map(terms.filter(({ slug }) => !NOT_A_TYPE.has(slug)).map(({ id, name }) => [id, tag(name)]));

	const members: ScrapedCompany[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const resp = await read(
			`${MEMBERS_URL}?partners_type_taxonomy=${current}&per_page=${MEMBERS_PER_PAGE}&page=${page}` +
				'&_fields=title,content,partners_type_taxonomy'
		);
		for (const { title, content, partners_type_taxonomy: types } of (await resp.json()) as Member[]) {
			members.push({
				name: nameOf(title?.rendered ?? ''),
				category: ['Member', ...(types ?? []).flatMap((id) => typeOf.get(id) ?? [])].join(', '),
				url:
					[...(content?.rendered ?? '').matchAll(LINK)]
						.map(([, href]) => href)
						.find((href) => !NOT_THE_MEMBER.test(href)) ?? ''
			});
		}
		if (page >= Number(resp.headers.get('x-wp-totalpages') ?? 1)) break;
	}
	return members;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const portfolio = await readPortfolio();
	const members = await readMembers();
	// a list missing must not pass for the fund having nothing there
	if (portfolio.length === 0) throw new Error('climatekic: no companies on the portfolio page');
	if (members.length === 0) throw new Error('climatekic: no members in the rest api');

	const companies = new Map<string, ScrapedCompany>();
	for (const company of [...portfolio, ...members]) {
		const key = company.name.toLowerCase();
		const known = companies.get(key);
		if (!company.name) continue;
		// a startup that has also joined as a member stays a startup, and says both
		if (known) known.category = [known.category, 'Member'].filter(Boolean).join(', ');
		else companies.set(key, { ...company });
	}
	return [...companies.values()];
}
