import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.clocktowerventures.com';
// the portfolio is a section of the home page
const PAGE_URL = `${BASE_URL}/`;
const CATEGORIES_URL = `${BASE_URL}/wp-json/wp/v2/portfolio_category?per_page=100&_fields=id,name`;
// siteground's firewall answers 403 to chrome user-agent strings, as it does
// for cortical, helios and stray dog, and lets through a request that says
// plainly who is asking: so this one does, and wears nothing else. an
// address the firewall distrusts gets its captcha page whatever it says, and
// then the run fails saying so
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// wordpress with wpbakery: the home page's portfolio section is a grid of
// logos, drawn twice over for different screens, each with the company's
// name linking its site and a line about it. a company the fund is out of
// says so at the head of its line, "(Acquired by Stavvy)" or "(Merged with
// Optum)", which is kept as the outcome. each company carries the class of
// the category it is filed under ("Fintech", "Regeneration"), and only the
// rest api spells the categories out; should it not answer, the companies
// come without them.

const ITEM = /(?=<article\b[^>]*\bclass=['"]mix\b)/;
const CLASSES = /^<article\b[^>]*\bclass=['"]([^'"]*)['"]/;
const TITLE = /<h2\b[^>]*\bclass="portfolio_title[^"]*"[^>]*>\s*<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
const EXCERPT = /<div class="portfolio_excerpt">([\s\S]*?)<\/div>/;
// "(Acquired by Stavvy)", "(Merged with Sage Group)"
const NOTE = /^\((acquired by [^)]+|merged with [^)]+|acquired|ipo)\)/i;
const STEALTH = /^stealth\b/i;

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

// an answer that is the site's, or an error saying what the firewall said
async function get(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	const body = await resp.text();
	if (resp.ok && resp.status !== 202 && !/sgcaptcha/i.test(body)) return body;
	const title = clean(body.match(/<title[^>]*>([^<]*)</)?.[1] ?? '');
	throw new Error(
		`clocktower: ${url} answered ${resp.status}${title ? ` "${title}"` : ''}` +
			(/sgcaptcha/i.test(body) ? ", siteground's captcha" : '')
	);
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await get(PAGE_URL);
	const labels = await categories();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const title = item.match(TITLE);
		const name = clean(title?.[2] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const note = clean(item.match(EXCERPT)?.[1] ?? '').match(NOTE)?.[1] ?? '';
		const filed = [...(item.match(CLASSES)?.[1] ?? '').matchAll(/\bportfolio_category_(\d+)\b/g)].map(
			([, id]) => labels.get(id) ?? ''
		);
		const site = unescape(title?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...filed, note ? sentence(tag(note)) : '', note ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('clocktower: no companies in the portfolio section');
	}

	return companies;
}
