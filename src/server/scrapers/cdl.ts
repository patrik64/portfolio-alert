import type { ScrapedCompany } from './types';

const BASE_URL = 'https://creativedestructionlab.com';
const PAGE_URL = `${BASE_URL}/companies/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
// the filtered listings are asked for one at a time, a pause between them,
// and a refusal is waited out once
const PACE_MS = 150;
const RETRY_DELAY_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page holds some nineteen
// hundred tiles at once, each linking a company's page on the lab's site,
// its name and the stream it went through under the logo. which of the
// lab's sites it went through, and in which cohort year, is told on that
// page, and so is the company's own address — but nineteen hundred slow
// pages a night is more than can be asked, so each company links to its
// page here. the site and the cohort are learned from the page's filters
// instead: they post a form to admin-ajax and get back the tiles a choice
// holds, one request for each cohort year and each site.
//
// the cohort is also what tells a graduate from the rest: a score of the
// tiles are organisations — partners, the firms mentors come from, a bank,
// a government — that went through no cohort, and they are left out. so
// the cohorts have to answer, all of them, or the run fails rather than
// take a part of the list for the whole; a site that will not answer only
// leaves its companies without that label. a company that went through
// twice is listed twice, and is kept once with the labels of both.

// a tile: the company's page, and under the logo its name — in a paragraph
// the theme calls the location — and its streams
const TILE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="js-companybio-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /<p class="companybio-location">([\s\S]*?)<\/p>/;
const STREAMS = /<p class="companybio-stream">([\s\S]*?)<\/p>/;
const FILTER = /<form\b[^>]*\bid="companies-filter"[^>]*>([\s\S]*?)<\/form>/;
const HIDDEN = /<input\b[^>]*\btype="hidden"[^>]*\bname="([^"]+)"[^>]*\bvalue="([^"]*)"/g;
const SELECT = /<select\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g;
const OPTION = /<option\b([^>]*)>([\s\S]*?)<\/option>/g;
// the two filters asked, by the names of their fields in the form
const COHORTS = 'cohortsfilter';
const SITES = 'c-locationsfilter';
// nine ventures of the lab's first years were never filed under a cohort,
// though their pages describe them as they do any graduate: kept by the
// last part of their pages' addresses
const UNFILED = new Set([
	'airo',
	'artiste-qb',
	'automat',
	'black-brane-systems-inc',
	'seamlessmd',
	'singspiel',
	'taplytics',
	'vertical-ai',
	'vote-compass'
]);
const STEALTH = /^stealth\b/i;

interface Tile {
	page: string;
	name: string;
	streams: string[];
}

interface Company extends Tile {
	sites: string[];
	cohorts: string[];
	unfiled: boolean;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the tiles in a listing; a company in two streams has them comma-joined
const tilesIn = (html: string): Tile[] =>
	[...html.matchAll(TILE)].map(([, page, tile]) => ({
		page: unescape(page).trim(),
		name: clean(tile.match(NAME)?.[1] ?? ''),
		streams: clean(tile.match(STREAMS)?.[1] ?? '')
			.split(/\s*,\s*/)
			.filter(Boolean)
	}));

// the pages of the companies a filled-in filter form holds, as admin-ajax
// answers the page's own script
async function heldBy(form: Record<string, string>): Promise<string[]> {
	const ask = () =>
		fetch(AJAX_URL, {
			method: 'POST',
			headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(form).toString()
		});
	let resp = await ask();
	if (resp.status === 429) {
		await wait(RETRY_DELAY_MS);
		resp = await ask();
	}
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${AJAX_URL}: ${resp.status}`);
	}
	const answer = (await resp.json()) as { posts_content?: string };
	return tilesIn(answer.posts_content ?? '').map((tile) => tile.page);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const tiles = tilesIn(html);
	if (tiles.length === 0) {
		throw new Error('cdl: no companies on the companies page');
	}

	// the filter form as the page would send it with nothing chosen — the
	// action it names, and each field its first option, which has no value
	// and so goes as its text — and the choices each filter offers; one with
	// no company behind it is disabled
	const filter = html.match(FILTER)?.[1] ?? '';
	const form: Record<string, string> = Object.fromEntries(
		[...filter.matchAll(HIDDEN)].map(([, field, value]) => [field, unescape(value)])
	);
	const choices = new Map<string, { value: string; label: string }[]>();
	for (const [, field, options] of filter.matchAll(SELECT)) {
		const offered = [...options.matchAll(OPTION)].map(([, attrs, label]) => ({
			value: attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? '',
			label: clean(label),
			disabled: /\bdisabled\b/.test(attrs)
		}));
		form[field] = offered.find((option) => !option.value)?.label ?? '';
		choices.set(
			field,
			offered.filter((option) => option.value && option.label && !option.disabled)
		);
	}

	if (!choices.get(COHORTS)?.length) {
		throw new Error('cdl: the companies page offers no cohorts to filter by');
	}

	// the labels a filter files each company's page under, choice by choice;
	// a cohort that will not answer fails the run, a site is passed over
	const filedBy = async (field: string) => {
		const labels = new Map<string, string[]>();
		for (const { value, label } of choices.get(field) ?? []) {
			await wait(PACE_MS);
			const pages = await heldBy({ ...form, [field]: value }).catch((err: unknown) => {
				if (field === COHORTS) throw err;
				return [] as string[];
			});
			for (const page of pages) {
				labels.set(page, [...(labels.get(page) ?? []), label]);
			}
		}
		return labels;
	};
	const cohorts = await filedBy(COHORTS);
	const sites = await filedBy(SITES);

	const byName = new Map<string, Company>();
	for (const tile of tiles) {
		if (!tile.name || STEALTH.test(tile.name)) continue;
		const key = tile.name.toLowerCase();
		const company = byName.get(key) ?? { ...tile, streams: [], sites: [], cohorts: [], unfiled: false };
		company.streams.push(...tile.streams);
		company.sites.push(...(sites.get(tile.page) ?? []));
		company.cohorts.push(...(cohorts.get(tile.page) ?? []));
		company.unfiled ||= UNFILED.has(tile.page.replace(/\/+$/, '').split('/').pop() ?? '');
		byName.set(key, company);
	}

	const graduates = [...byName.values()].filter((company) => company.cohorts.length > 0 || company.unfiled);
	// the organisations are a hundredth of the list: more than a tenth gone
	// means the cohort filter no longer tells what it did
	if (graduates.length < byName.size * 0.9) {
		throw new Error(`cdl: the cohort filter accounts for only ${graduates.length} of ${byName.size} companies`);
	}

	return graduates.map((company) => ({
		name: company.name,
		category: [...company.streams, ...company.sites, ...company.cohorts.sort().map((year) => `Cohort ${year}`)]
			.filter((t, i, all) => t && all.indexOf(t) === i)
			.join(', '),
		url: company.page || PAGE_URL
	}));
}
