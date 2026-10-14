import type { ScrapedCompany } from './types';

const BASE_URL = 'https://jsf.co';
const PAGE_URL = `${BASE_URL}/jsf-portfolio/`;
// the projects the portfolio page's grid is drawn from, as the site serves them
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const PER_PAGE = 100;
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with divi's filter grid: the portfolio page is a grid of logos,
// twelve a page and more behind "View More", drawn from the site's
// "project" records — a company each, named, linking its page here, and
// filed by the page's filters under a category ("Healthcare IT", "Tech
// Enabled Healthcare Services"), the year it came to the foundry and a
// status ("Active", "Exited"). the records are read whole from the site's
// own api, a hundred a page, every page of it, and must add up to the
// total the api gives. a company's page gives no site of its own, so each
// links its page here.
//
// a name is the company's registered one as often as not ("Wiggl Health,
// Inc.") or carries a note in brackets ("Athel AI (Ertyoc Inc.)",
// "Transparent Health Technologies (formerly RootHealth Technologies)");
// the legal form and the note are not part of it. the category and the
// year are kept as tags, an exit with the Exited tag.

const NOTE = /\s*\([^()]*\)\s*$/;
const FORM = /[\s,]+(?:inc\.?|llc|llp|ltd\.?|limited|corp\.?|co\.?|pbc|gmbh)$/i;
const YEAR = /^(?:19|20)\d{2}$/;
const EXITED = /^exit(?:ed)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
const STEALTH = /^stealth\b/i;

interface Project {
	link?: string;
	title?: { rendered?: string };
	project_category?: number[];
	project_tag?: number[];
	project_status?: number[];
}

interface Term {
	id: number;
	name: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "Wiggl Health, Inc." -> "Wiggl Health", "Athel AI (Ertyoc Inc.)" -> "Athel AI"
function nameOf(written: string): string {
	let name = written;
	for (let before = ''; before !== name; ) {
		before = name;
		name = name.replace(NOTE, '').replace(FORM, '').trim();
	}
	return name || written;
}

async function get(url: string): Promise<Response> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp;
}

// a taxonomy's terms, by id
async function termsOf(taxonomy: string): Promise<Map<number, string>> {
	const terms: Term[] = await (await get(`${API_URL}/${taxonomy}?per_page=100&_fields=id,name`)).json();
	return new Map(terms.map(({ id, name }) => [id, clean(name)]));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [categories, years, statuses] = await Promise.all([
		termsOf('project_category'),
		termsOf('project_tag'),
		termsOf('project_status')
	]);

	// the whole list, a page at a time; a part of it must not pass for the whole
	const projects: Project[] = [];
	let total = 0;
	for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
		const url: string = `${API_URL}/project?per_page=${PER_PAGE}&page=${page}&_fields=link,title,project_category,project_tag,project_status`;
		const resp: Response = await get(url);
		total = Number(resp.headers.get('x-wp-total') ?? 0);
		pages = Number(resp.headers.get('x-wp-totalpages') ?? 1);
		projects.push(...((await resp.json()) as Project[]));
	}
	if (projects.length < total) {
		throw new Error(`jumpstartfoundry: read ${projects.length} of the ${total} projects the api counts`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const project of projects) {
		const name = nameOf(clean(project.title?.rendered ?? ''));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the categories hold a few years of their own, kept with the years
		const filed = (project.project_category ?? []).map((id) => categories.get(id) ?? '');
		const year = [...filed, ...(project.project_tag ?? []).map((id) => years.get(id) ?? '')].find((label) =>
			YEAR.test(label)
		);
		const status = (project.project_status ?? []).map((id) => statuses.get(id) ?? '');
		const link = unescape(project.link ?? '').trim();
		companies.push({
			name,
			category: [
				...filed.filter((label) => !YEAR.test(label)).map(tag),
				year ? `Invested ${year}` : '',
				status.some((label) => EXITED.test(label)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(link) ? link : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('jumpstartfoundry: the api lists no projects — the site moved');
	}

	return companies;
}
