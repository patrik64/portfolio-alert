import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.scout.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow. the grid is logos, and every company also has a modal in the
// html carrying its name, the industry it is filed under, and links marked
// WEBSITE and LINKEDIN. the modals are read, since the grid tiles say nothing.
//
// "Other" is the industry a third of them fall under, which is the fund's way
// of saying it has not filed the company anywhere, so it is dropped.

const MODAL = /<div company-slug="[^"]*" class="modal_component">([\s\S]*?)(?=<div company-slug="|<\/body)/g;
const NAME = /<h2 class="h2 company-modal-h2[^"]*">([^<]*)<\/h2>/;
const INDUSTRY = /INDUSTRY:<\/div><div class="p website-link-p is-capital">([^<]*)<\/div>/;
const SITE = /<a href="(https?:\/\/[^"]*)"[^>]*class="p website-link-p">WEBSITE<\/a>/;
const UNFILED = /^other$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(MODAL)) {
		const body = m[1];
		const name = clean(body.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const industry = clean(body.match(INDUSTRY)?.[1] ?? '');
		companies.push({
			name,
			category: UNFILED.test(industry) ? '' : industry,
			url: body.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('scout: no companies on the portfolio page');
	}

	return companies;
}
