import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.clocktowerventures.com';
// the portfolio is a section of the home page
const PAGE_URL = `${BASE_URL}/`;
// the same portfolio as the rest api lists it, a hundred a page
const LIST_URL = `${BASE_URL}/wp-json/wp/v2/portfolio_page?per_page=100&_fields=id,title,excerpt,content,portfolio_category`;
const CATEGORIES_URL = `${BASE_URL}/wp-json/wp/v2/portfolio_category?per_page=100&_fields=id,name`;
const RETRY_DELAY_MS = 10_000;
const MAX_PAGES = 20;
// siteground's firewall answers 403 to chrome user-agent strings, as it does
// for cortical, helios and stray dog, and lets through a request that says
// plainly who is asking: so this one does, and wears nothing else. an
// address the firewall distrusts gets its captcha page whatever it says
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// wordpress with wpbakery: the home page's portfolio section is a grid of
// logos, drawn twice over for different screens, each with the company's
// name linking its site and a line about it. a company the fund is out of
// says so at the head of its line, "(Acquired by Stavvy)" or "(Merged with
// Optum)", which is kept as the outcome. each company carries the class of
// the category it is filed under ("Fintech", "Regeneration"), and only the
// rest api spells the categories out; should it not answer, the companies
// come without them.
//
// the firewall puts its captcha in front of an address it distrusts, under
// a 202, and vercel's addresses are among them most nights. the page is
// asked for again after a wait, and when that is refused too the portfolio
// is read from the rest api's own listing of it, which carries the same
// companies, lines and categories — but not their sites, which only the
// page writes: a company first met that way links the page here. the
// listing must come whole, every page of it, or the run fails.

const ITEM = /(?=<article\b[^>]*\bclass=['"]mix\b)/;
const CLASSES = /^<article\b[^>]*\bclass=['"]([^'"]*)['"]/;
const TITLE = /<h2\b[^>]*\bclass="portfolio_title[^"]*"[^>]*>\s*<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
const EXCERPT = /<div class="portfolio_excerpt">([\s\S]*?)<\/div>/;
// "(Acquired by Stavvy)", "(Merged with Sage Group)"
const NOTE = /^\((acquired by [^)]+|merged with [^)]+|acquired|ipo)\)/i;
const CAPTCHA = /sgcaptcha/i;
const STEALTH = /^stealth\b/i;

interface Listed {
	title?: { rendered?: string };
	excerpt?: { rendered?: string };
	content?: { rendered?: string };
	portfolio_category?: number[];
}

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

const sentence = (s: string) => (/^ipo$/i.test(s) ? 'IPO' : s.charAt(0).toUpperCase() + s.slice(1));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// what a url answered: the site's own answer, or what the firewall said instead
async function ask(url: string): Promise<{ body: string; refused: string }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	const body = await resp.text();
	if (resp.ok && resp.status !== 202 && !CAPTCHA.test(body)) return { body, refused: '' };
	const title = clean(body.match(/<title[^>]*>([^<]*)</)?.[1] ?? '');
	return {
		body: '',
		refused:
			`${resp.status}${title ? ` "${title}"` : ''}` + (CAPTCHA.test(body) ? ", siteground's captcha" : '')
	};
}

// an answer that is the site's, or an error saying what the firewall said;
// the firewall's mind changes, so it is asked once more after a wait
async function get(url: string): Promise<string> {
	let answer = await ask(url);
	if (answer.refused) {
		await wait(RETRY_DELAY_MS);
		answer = await ask(url);
	}
	if (answer.refused) {
		throw new Error(`clocktower: ${url} answered ${answer.refused}`);
	}
	return answer.body;
}

// the categories' names by their numbers, or none when the api will not say
async function categories(): Promise<Map<string, string>> {
	try {
		const list = JSON.parse(await get(CATEGORIES_URL)) as { id?: number; name?: string }[];
		return new Map(list.filter((c) => c?.id && c.name).map((c) => [String(c.id), tag(c.name ?? '')]));
	} catch {
		return new Map();
	}
}

// a company's tags: the categories it is filed under, and its outcome
const tagsOf = (filed: string[], line: string) => {
	const note = line.match(NOTE)?.[1] ?? '';
	return [...filed, note ? sentence(tag(note)) : '', note ? 'Exited' : ''].filter(
		(t, i, all) => t && all.indexOf(t) === i
	);
};

// the companies as the home page writes them
function fromPage(html: string, labels: Map<string, string>): ScrapedCompany[] {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const title = item.match(TITLE);
		const name = clean(title?.[2] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const filed = [...(item.match(CLASSES)?.[1] ?? '').matchAll(/\bportfolio_category_(\d+)\b/g)].map(
			([, id]) => labels.get(id) ?? ''
		);
		const site = unescape(title?.[1] ?? '').trim();
		companies.push({
			name,
			category: tagsOf(filed, clean(item.match(EXCERPT)?.[1] ?? '')).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	return companies;
}

// the companies as the rest api lists them, every page of the listing or none
async function fromListing(labels: Map<string, string>): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = `${LIST_URL}&page=${page}`;
		const answer = await ask(url);
		if (answer.refused) {
			throw new Error(`clocktower: ${url} answered ${answer.refused}`);
		}
		let listed: Listed[];
		try {
			listed = JSON.parse(answer.body);
		} catch {
			throw new Error(`clocktower: ${url} answered with something other than the listing`);
		}
		if (!Array.isArray(listed)) {
			throw new Error(`clocktower: ${url} answered with something other than the listing`);
		}
		for (const entry of listed) {
			const name = clean(entry?.title?.rendered ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const filed = (entry.portfolio_category ?? []).map((id) => labels.get(String(id)) ?? '');
			const line = clean(entry.excerpt?.rendered ?? '') || clean(entry.content?.rendered ?? '');
			companies.push({ name, category: tagsOf(filed, line).join(', '), url: PAGE_URL });
		}
		// a page short of a hundred is the listing's last
		if (listed.length < 100) return companies;
	}
	throw new Error(`clocktower: the rest api's listing runs past ${MAX_PAGES} pages`);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	let page = await ask(PAGE_URL);
	if (page.refused) {
		await wait(RETRY_DELAY_MS);
		page = await ask(PAGE_URL);
	}
	const labels = await categories();
	const companies = page.refused ? await fromListing(labels) : fromPage(page.body, labels);
	if (companies.length === 0) {
		throw new Error(
			page.refused
				? `clocktower: ${PAGE_URL} answered ${page.refused}, and the rest api lists no companies`
				: 'clocktower: no companies in the portfolio section'
		);
	}

	return companies;
}
