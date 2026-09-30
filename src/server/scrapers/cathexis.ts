import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://cathexis.ventures/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio is a wall of logos, each linking the company's
// site over a caption of a few words ("Meeting API."), with no alt text and
// no name written anywhere. the logo files are named for the companies
// ("Remedial+Health.png"), which spells the names out once the file's
// dressing is taken off; the few it gets wrong are listed here. nothing
// sorts the companies or marks an exit.
const NAMES: Record<string, string> = {
	DynamoFL: 'Dynamo AI',
	Recall: 'Recall.ai',
	'Snack+Owl': 'SnackOwl'
};

const FIGURE = /<figure\b[\s\S]*?<\/figure>/g;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const LOGO = /\bdata-src="([^"]+)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

// "…/Remedial+Health.png" -> "Remedial+Health"
const fileOf = (src: string) => (src.split(/[?#]/)[0].split('/').pop() ?? '').replace(/\.\w+$/, '');

// "Remedial+Health" -> "Remedial Health", "Genuity2" -> "Genuity", "taxProper" stays
const spelled = (file: string) =>
	decodeURIComponent(file.replace(/\+/g, ' '))
		.replace(/(?<=[a-z])\d+$/i, '')
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => (/^[a-z]+$/.test(word) ? word[0].toUpperCase() + word.slice(1) : word))
		.join(' ');

// "/https:/www.clinikally.com/" is a site too
const siteOf = (href: string) => {
	const address = unescape(href)
		.trim()
		.replace(/^\/?(https?):\/+/i, '$1://');
	return /^https?:\/\/[^/]+\.[a-z]/i.test(address) ? address : '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [figure] of html.matchAll(FIGURE)) {
		const src = figure.match(LOGO)?.[1];
		if (!src) continue;
		const file = fileOf(src);
		const name = NAMES[file] ?? spelled(file);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: siteOf(figure.match(LINK)?.[1] ?? '') || PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('cathexis: no logos on the portfolio page');
	}

	return companies;
}
