import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://idekapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of panels, the whole of it in the
// page, a panel a company with its logo, a few lines about it, a list —
// "Business model", "Stage", "Invested: June 2023", "Exited: --" or
// "Exited: November 2022 (acquired by Teya)" — and a button to its site
// that names it ("Visit Kongsberg Digital"; "Visit Flowcase", where the
// button's hidden title still has its old name). a panel without a button
// is named by its logo's alt text ("Teston Logo"). the stage and the year
// the fund invested are kept as tags, an exit with the Exited tag and the
// buyer where the panel names one.

const PANEL = /(?=<div class="uncode-single-media portfoliologo-single\b)/;
const BUTTON = /<a\b[^>]*\brole="button"[^>]*\bhref="([^"]*)"[^>]*>\s*([\s\S]*?)\s*<\/a>/;
const LOGO = /<img\b[^>]*\balt="([^"]+)"/;
const FACT = /<li>\s*([^:<]+):\s*([^<]*?)\s*<\/li>/g;
const VISIT = /^visit\s+/i;
// "Teston Logo", "Logo Teston"
const LOGO_WORD = /^logo\s+|\s+logo$/gi;
const YEAR = /\b(?:19|20)\d{2}\b/;
const NOT_YET = /^-*$/;
// "November 2022 (acquired by Teya)", "July 2022 to TGS ASA"
const BUYER = /\(\s*acquired by\s+([^)]+?)\s*\)|\bto\s+(.+?)\s*$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const panel of html.split(PANEL).slice(1)) {
		const button = panel.match(BUTTON);
		const name =
			clean(button?.[2] ?? '').replace(VISIT, '') ||
			clean(panel.match(LOGO)?.[1] ?? '')
				.replace(LOGO_WORD, '')
				.trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const facts = new Map(
			[...panel.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)])
		);
		const invested = facts.get('invested')?.match(YEAR)?.[0];
		const exit = facts.get('exited') ?? '';
		const exited = !NOT_YET.test(exit);
		const sale = exited ? exit.match(BUYER) : null;
		const buyer = clean(sale?.[1] ?? sale?.[2] ?? '');
		const site = unescape(button?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				tag(facts.get('stage') ?? ''),
				invested ? `Invested ${invested}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('idekapital: no companies on the portfolio page — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("idekapital: no panel links its company's site — the markup moved");
	}

	return companies;
}
