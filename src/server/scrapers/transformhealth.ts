import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://transformhealthventures.com/portfolio/';
// the host drops the connection of a client claiming to be chrome without being
// one, and answers one that gives its own name
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// wordpress and divi on siteground: a wall of logos, each linking the company's site, under a
// heading per portfolio, the fund's own and its two earlier ones, "VEP Ventures"
// and "VEP Ventures II". the name is only in the logo's alt text ("Image of the
// Mednition Logo"), which every one of them has so far; one without is named after
// its address. the page draws the two older portfolios twice, the second time with
// the heading worded "VEP Ventures Portfolio II", so a company is merged by name
// and the word Portfolio left out of the tag. one in two portfolios gets both.
const TOKEN =
	/<h2\b[^>]*>([\s\S]*?)<\/h2>|<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*<span class="et_pb_image_wrap[^"]*">\s*<img\b[^>]*\balt="([^"]*)"/g;
const ALT_WORDS = /^image of (?:the )?|\s+logo$/gi;
const PORTFOLIO_WORD = /\s*\bportfolio\b/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&rsquo;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

// "hello-bio.com" -> "Hello Bio"
const nameFrom = (url: string) =>
	new URL(url).hostname
		.replace(/^www\./, '')
		.split('.')[0]
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies = new Map<string, { name: string; url: string; tags: Set<string> }>();
	let portfolio = '';
	for (const [, heading, href, alt] of html.matchAll(TOKEN)) {
		if (heading !== undefined) {
			portfolio = tag(clean(heading).replace(PORTFOLIO_WORD, '').trim());
			continue;
		}
		const url = href.trim();
		const name = clean(alt).replace(ALT_WORDS, '').trim() || nameFrom(url);
		const key = name.toLowerCase();
		const company = companies.get(key) ?? { name, url, tags: new Set<string>() };
		if (portfolio) company.tags.add(portfolio);
		companies.set(key, company);
	}

	if (companies.size === 0) {
		throw new Error('transformhealth: no companies on the portfolio page');
	}

	return [...companies.values()].map(({ name, url, tags }) => ({ name, category: [...tags].join(', '), url }));
}
