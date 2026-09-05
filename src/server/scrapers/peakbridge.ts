import type { ScrapedCompany } from './types';

const BASE_URL = 'https://peakbridge.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// wordpress on elementor. the portfolio page sorts the companies into tabs —
// one per theme, plus an "All" that repeats them — but names them only in
// passing: what it links to is a page of the fund's own per company, and the
// company's site, the stage and the rest are on that page.
//
// so the tabs give a company its theme and its page gives everything else. the
// pages are read a batch at a time.
//
// the fund links one company under two slugs, wnwn and win-win, the first
// redirecting to the second, so both come back named Win-Win and the second is
// dropped. four companies have no site of their own on their page and keep the
// fund's page instead.

const TAB = /data-tab="(\d)"[^>]*role="tab"[^>]*><span>([^<]*)<\/span>/g;
const PANE = /class="elementor-tab-content elementor-clearfix plus-tab-content" data-tab="(\d)"/g;
const COMPANY = /href="(https:\/\/peakbridge\.vc\/peakbridge_portfolio\/[^"/]+\/)"/g;
const TITLE = /<title>([^<]*)<\/title>/;
const STAGE = /<b>Funding Stage:<\/b>\s*([^<]*)</;
const SITE = /href="(https?:\/\/[^"]+)"/g;
// the fund's own pages, and the places every page links to whoever the
// company is
const NOT_THE_COMPANY =
	/peakbridge|w3\.org|gmpg|google|gstatic|schema\.org|twitter|x\.com|linkedin|facebook|instagram|youtube|vimeo|cloudflare|cdn-cgi/i;
// the tab that repeats every company rather than naming a theme
const EVERY = /^all$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&#187;|&raquo;/g, '»')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a stage the fund wrote as "Seed, Series A"
// would read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// one link was copied out of an ad and carries the click that led to it. that
// is a record of someone's visit rather than the company's address, and it
// would keep the company from being recognised as the one other funds link to
const TRACKING = /^(?:gclid|gad_source|gbraid|wbraid|fbclid|msclkid|mc_[a-z]+|utm_[a-z]+)$/i;
const withoutTracking = (href: string) => {
	try {
		const address = new URL(href);
		for (const key of [...address.searchParams.keys()]) {
			if (TRACKING.test(key)) address.searchParams.delete(key);
		}
		return address.toString().replace(/\?$/, '');
	} catch {
		return href;
	}
};

async function fetchCompany(url: string, themes: string[]): Promise<ScrapedCompany | undefined> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) return undefined;
	const html = await resp.text();

	// the page is titled "<company> » PeakBridge VC", and the raquo is written
	// as an entity, so the title has to be unescaped before it is split on
	const name = clean(clean(html.match(TITLE)?.[1] ?? '').split('»')[0]);
	if (!name) return undefined;

	const site = [...html.matchAll(SITE)]
		.map((m) => withoutTracking(clean(m[1])))
		.find((h) => !NOT_THE_COMPANY.test(h));

	return {
		name,
		category: [...themes, tag(html.match(STAGE)?.[1] ?? '')].filter(Boolean).join(', '),
		url: site ?? url
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const labels = new Map([...html.matchAll(TAB)].map((m) => [m[1], clean(m[2])]));

	// which theme each company is filed under, read off the tab it sits in
	const themes = new Map<string, string[]>();
	const panes = [...html.matchAll(PANE)];
	for (const [i, pane] of panes.entries()) {
		const body = html.slice(pane.index, panes[i + 1]?.index ?? html.length);
		const label = labels.get(pane[1]) ?? '';

		for (const m of body.matchAll(COMPANY)) {
			const filed = themes.get(m[1]) ?? [];
			if (label && !EVERY.test(label) && !filed.includes(label)) filed.push(label);
			themes.set(m[1], filed);
		}
	}

	const links = [...themes.keys()];
	if (links.length === 0) {
		throw new Error('peakbridge: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < links.length; i += BATCH_SIZE) {
		const found = await Promise.all(
			links.slice(i, i + BATCH_SIZE).map((link) => fetchCompany(link, themes.get(link) ?? []))
		);
		for (const company of found) {
			if (!company || seen.has(company.name.toLowerCase())) continue;
			seen.add(company.name.toLowerCase());
			companies.push(company);
		}
	}

	if (companies.length === 0) {
		throw new Error('peakbridge: no companies behind the portfolio tabs');
	}

	return companies;
}
