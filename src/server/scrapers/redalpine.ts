import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.redalpine.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the tokens wix hands every visitor, one per app on the site
const TOKENS_URL = `${BASE_URL}/_api/v1/access-tokens`;
const QUERY_URL = `${BASE_URL}/_api/cloud-data/v2/items/query`;
// wix's data app, whose token reads the site's collections
const WIX_DATA = '675bbcef-18d8-41f5-800e-131ec9e08762';
const COLLECTION = 'Portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio page and a page per company are drawn from one of the
// site's data collections, "Portfolio" (named in the page's router config),
// which the page reads in the browser with the token wix hands any visitor.
// until october 2026 wix rendered the list on its server and the run read it
// there and then each company's page; since 2026-10-22 an ordinary visitor
// gets the list page unrendered, and a hundred company pages in a row run
// into wix's rate limit. so the collection is read the way the page reads
// it, whole, in one query: a company each with its name, status ("active",
// "exited"), sectors, country, the fund it was backed from ("rac VI"), the
// years it was founded and the fund came in, and its homepage. the fund
// writes everything in lower case, the names too ("n26", "mistral ai"),
// and they are kept as it writes them. the collection also holds the
// fund's own vehicles (rac VII, rac VIII), which have no status and are
// left out. the sectors, country, fund and years are kept as tags, an exit
// with the Exited tag.

const EXITED = /^exited$/i;
const STATUS = /^(?:active|exited)$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
const STEALTH = /^stealth\b/i;

interface Item {
	title?: unknown;
	status?: unknown;
	sector?: unknown;
	geography?: unknown;
	fund1?: unknown;
	foundingYear?: unknown;
	investingYear?: unknown;
	homepage?: unknown;
	'link-portfolio-title-2'?: unknown;
}

const clean = (s: unknown) =>
	String(s ?? '')
		.replace(/[​-‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

const list = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : clean(v) ? [clean(v)] : []);

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: unknown) => clean(s).replace(/\s*,\s*/g, ' / ');

const year = (s: unknown) => clean(s).match(/\b(?:19|20)\d{2}\b/)?.[0];

// "https://www.spacex.com/" -> the host, to tell a company's site from the rest
function hostOf(href: string): string {
	try {
		return new URL(href).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
}

async function json(url: string, init?: RequestInit): Promise<unknown> {
	const resp = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init?.headers ?? {}) } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const tokens = (await json(TOKENS_URL)) as { apps?: Record<string, { instance?: string }> };
	const instance = tokens.apps?.[WIX_DATA]?.instance;
	if (!instance) {
		throw new Error("redalpine: wix handed no token for the site's data — the site moved off wix data");
	}
	const answer = (await json(QUERY_URL, {
		method: 'POST',
		headers: { Authorization: instance, 'Content-Type': 'application/json' },
		body: JSON.stringify({ dataCollectionId: COLLECTION, query: { paging: { limit: 1000 } } })
	})) as { dataItems?: { data?: Item }[]; pagingMetadata?: { hasNext?: boolean } };
	if (answer.pagingMetadata?.hasNext) {
		throw new Error('redalpine: the portfolio collection runs past one page of a thousand');
	}
	const items = (answer.dataItems ?? []).map((item) => item.data ?? {});

	// a company entry started as a copy of another can still carry the
	// other's homepage ("magdrive" with spacex.com); a homepage given to
	// several companies stays only with one whose name its host spells
	const sharing = new Map<string, number>();
	for (const item of items) {
		const host = hostOf(clean(item.homepage));
		if (host) sharing.set(host, (sharing.get(host) ?? 0) + 1);
	}
	const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const item of items) {
		const name = clean(item.title);
		const status = list(item.status)[0] ?? '';
		if (!name || !STATUS.test(status) || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		let site = clean(item.homepage);
		const host = hostOf(site);
		if (!/^https?:\/\//i.test(site) || ((sharing.get(host) ?? 0) > 1 && !letters(host).includes(letters(name)))) {
			site = '';
		}
		if (site) withSite++;
		const profile = clean(item['link-portfolio-title-2']);
		const founded = year(item.foundingYear);
		const invested = year(item.investingYear);
		companies.push({
			name,
			category: [
				...list(item.sector).map(tag),
				...list(item.geography).map(tag),
				tag(item.fund1),
				founded ? `Founded ${founded}` : '',
				invested ? `Invested ${invested}` : '',
				EXITED.test(status) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || (profile.startsWith('/portfolio/') ? `${BASE_URL}${profile}` : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('redalpine: no companies in the portfolio collection');
	}
	// a collection that stopped carrying homepages would leave every company linking the fund's site
	if (withSite === 0) {
		throw new Error('redalpine: no company in the collection has a homepage — the collection moved');
	}

	return companies;
}
