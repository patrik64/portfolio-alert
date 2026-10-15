import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.anthemis.com/portfolio/';
// the site turns the usual browser string away with a 403 and answers
// this one, which says who is asking
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';
// the site sits behind siteground's firewall, which puts its captcha in
// front of an address it distrusts under a 2xx status, vercel's among them
// some nights; the page is asked for again after a wait, and the error
// says what the firewall answered
const RETRY_DELAY_MS = 10_000;

// wordpress with elementor: the portfolio page is a grid of companies, each
// named and linking the company's page on the fund's site, and carrying as
// classes the terms the filters above it read: the thesis ("Payments"),
// the strategy ("Venture", "Lab", "Fund") and the stage ("Early",
// "Growth", or "Acquired" for the ones the fund is out of), spelled out
// on the filters' buttons and kept as tags.
//
// a company's page has its site behind a "website" link, and nothing else
// on the fund's site gives it — not its rest api, not its feed. reading a
// hundred and fifty of those pages a night is what had the firewall turn
// the fetch away, so they are not read: the grid alone is, one request,
// and every company links its page on the fund's site.

const FILTER = /(?=\belementor-widget-taxonomy-filter\b)/;
const FILTER_TAXONOMY = /&quot;taxonomy&quot;:&quot;([\w-]+)&quot;/;
const BUTTON = /<button\b[^>]*\bdata-filter="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g;
const GRID = 'data-widget_type="loop-grid';
const ITEM = /(?=<div\b[^>]*\bclass="elementor elementor-\d+ e-loop-item\b)/;
const CLASSES = /^<div\b[^>]*\bclass="([^"]*)"/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const NAME = /<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const TAXONOMIES = ['thesis', 'strategy', 'stage'];
const OUT = /^acquired$/i;
const STEALTH = /^stealth\b/i;

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

// a term no button spells out: "female-innovators-lab" -> "Female Innovators Lab"
const spelled = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the portfolio page, or an error saying what answered instead
async function portfolioPage(): Promise<string> {
	let answer = '';
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt > 0) await wait(RETRY_DELAY_MS);
		const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
		const html = await resp.text();
		if (resp.ok && html.includes(GRID)) return html;
		answer = `${resp.status}` + (/sgcaptcha/i.test(html) ? ", siteground's captcha" : '');
	}
	throw new Error(`anthemis: ${PAGE_URL} answered ${answer}`);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await portfolioPage();

	// "stage-acquired" -> "Acquired", from the filters' buttons
	const labels = new Map<string, string>();
	for (const filter of html.split(FILTER).slice(1)) {
		const taxonomy = filter.match(FILTER_TAXONOMY)?.[1];
		if (!taxonomy) continue;
		for (const [, slug, label] of filter.matchAll(BUTTON)) {
			if (!slug.startsWith('__')) labels.set(`${taxonomy}-${slug}`, tag(label));
		}
	}

	const at = html.indexOf(GRID);
	if (at < 0) {
		throw new Error('anthemis: no grid on the portfolio page');
	}
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.slice(at).split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const classes = (item.match(CLASSES)?.[1] ?? '').split(/\s+/);
		const terms = TAXONOMIES.flatMap((taxonomy) =>
			classes
				.filter((c) => c.startsWith(`${taxonomy}-`))
				.map((c) => labels.get(c) ?? spelled(c.slice(taxonomy.length + 1)))
		);
		const out = terms.some((t) => OUT.test(t));
		const page = unescape(item.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...terms, out ? 'Exited' : ''].filter((t, i, all) => t && all.indexOf(t) === i).join(', '),
			url: /^https?:\/\//i.test(page) ? page : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('anthemis: no companies in the grid');
	}

	return companies;
}
