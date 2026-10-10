import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.redalpine.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio page is a repeater of companies, whose contents wix
// renders on its server and hands the page as warmup data — for each item,
// by the id of the element showing it, the company's name, its status
// ("active" or "exited"), its sector ("fintech", "frontier science &
// biotech") and a link to its page here. the fund writes everything in
// lower case, the names too ("n26", "mistral ai"), and they are kept as it
// writes them. a company's page adds, the same way, the fund it was backed
// from ("rac VI", "summit fund"), the years the fund invested and it was
// founded, and links to its site. the sector, the fund and the years are
// kept as tags, an exit with the Exited tag. a company page that will not
// load, or names no site of the company's own, leaves its company linking
// that page.
//
// the elements are known by their ids in the site's design; were the
// design to change them, the list would come up empty and fail the run.

const WARMUP = /<script\b[^>]*\bid="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/;
const LIST = {
	repeater: 'comp-ls4tn4ra',
	name: 'comp-ls4tn4sy6',
	status: 'comp-lp6o0bd5',
	sector: 'comp-lp6nlgs0',
	profile: 'comp-lp19bwdg'
};
const DETAIL = {
	fund: 'comp-lp895lhs4',
	invested: 'comp-lp895lhw',
	founded: 'comp-lp895lhx1'
};
// a company's page links its site, its social pages and the fund's posts
const NOT_SITE =
	/^(?:[\w-]+\.)*(?:redalpine\.com|linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com|youtu\.be|wix\.com|wixsite\.com)$/i;
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
const STEALTH = /^stealth\b/i;

interface Props {
	html?: string;
	items?: string[];
	link?: { href?: string; type?: string };
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

// wix fills an empty field with a zero-width space
const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ' '))
		.replace(/[​-‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const year = (s: string | undefined) => s?.match(/\b(?:19|20)\d{2}\b/)?.[0];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// what wix rendered for each element, by its id ("comp-…" or, inside a
// repeater, "comp-…__item")
function propsOf(html: string): Map<string, Props> {
	const props = new Map<string, Props>();
	const data = html.match(WARMUP)?.[1];
	if (!data) return props;
	try {
		const updates = (JSON.parse(data)?.platform?.ssrPropsUpdates ?? []) as Record<string, Props>[];
		for (const update of updates) {
			for (const [id, value] of Object.entries(update)) {
				props.set(id, { ...props.get(id), ...value });
			}
		}
	} catch {
		// warmup data that will not parse gives nothing
	}
	return props;
}

// "https://www.spacex.com/" -> the host, to tell a company's site from the rest
function hostOf(href: string): string {
	try {
		return new URL(href).hostname;
	} catch {
		return '';
	}
}

interface Page {
	site: string;
	fund: string;
	invested?: string;
	founded?: string;
}

// what a company's page says, or nothing when it will not load; a refusal
// is waited out once
async function pageOf(href: string): Promise<Page | null> {
	try {
		let resp = await fetch(href, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			resp = await fetch(href, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) {
			await resp.body?.cancel();
			return null;
		}
		const props = propsOf(await resp.text());
		const text = (id: string) => clean(props.get(id)?.html ?? '');
		const site =
			[...props.values()]
				.map((p) => (p.link?.type === 'ExternalLink' ? unescape(p.link.href ?? '').trim() : ''))
				.find((link) => /^https?:\/\//i.test(link) && hostOf(link) && !NOT_SITE.test(hostOf(link))) ?? '';
		return {
			site,
			fund: text(DETAIL.fund),
			invested: year(text(DETAIL.invested)),
			founded: year(text(DETAIL.founded))
		};
	} catch {
		return null;
	}
}

interface Listed {
	name: string;
	profile: string;
	status: string;
	sector: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const props = propsOf(await resp.text());
	const items = props.get(LIST.repeater)?.items ?? [];

	const listed: Listed[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const text = (id: string) => clean(props.get(`${id}__${item}`)?.html ?? '');
		const name = text(LIST.name);
		const profile = unescape(props.get(`${LIST.profile}__${item}`)?.link?.href ?? '').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		listed.push({
			name,
			profile: profile.startsWith(`${BASE_URL}/`) ? profile : '',
			status: text(LIST.status),
			sector: text(LIST.sector)
		});
	}
	if (listed.length === 0) {
		throw new Error("redalpine: no companies in the portfolio page's warmup data — the design moved");
	}

	const pages: (Page | null)[] = [];
	for (const [i, company] of listed.entries()) {
		if (i > 0) await wait(PACE_MS);
		pages.push(company.profile ? await pageOf(company.profile) : null);
	}

	// a company page started as a copy of another can still link the other's
	// site ("magdrive" linking spacex.com); a site given to several companies
	// stays only with one whose name its host spells
	const sharing = new Map<string, number>();
	for (const page of pages) {
		const host = hostOf(page?.site ?? '').replace(/^www\./, '');
		if (host) sharing.set(host, (sharing.get(host) ?? 0) + 1);
	}
	const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

	const companies: ScrapedCompany[] = [];
	let withSite = 0;
	for (const [i, company] of listed.entries()) {
		const page = pages[i];
		const host = hostOf(page?.site ?? '').replace(/^www\./, '');
		if (page && host && (sharing.get(host) ?? 0) > 1 && !letters(host).includes(letters(company.name))) {
			page.site = '';
		}
		if (page?.site) withSite++;
		companies.push({
			name: company.name,
			category: [
				tag(company.sector),
				page?.fund ? tag(page.fund) : '',
				page?.founded ? `Founded ${page.founded}` : '',
				page?.invested ? `Invested ${page.invested}` : '',
				EXITED.test(company.status) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: page?.site || company.profile || PAGE_URL
		});
	}
	// without the company pages every company would link the fund's site
	if (withSite === 0) {
		throw new Error("redalpine: no company page gave its site — the pages' design moved");
	}

	return companies;
}
