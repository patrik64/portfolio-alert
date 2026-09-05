import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.northstar.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// next.js, served rendered. the grid is a wall of logos until one is hovered,
// and what is behind each is in the html whether or not anyone hovers: the
// sector, a line about what the company does, and the name, which the card
// prints last of the three.
//
// the card carries no address — it links to the fund's page for the company,
// and the company's own address is printed there under Links, beside its
// linkedin and a column of news. so those pages are read too, and the link is
// found by the words over it rather than by being the first off the site,
// which the news items would be.
//
// the fund files a company under one sector and nothing else: no stage, no
// place, and no mark for a company that has gone.

const CARD = /<a class="group relative block aspect-\[5\/4\][\s\S]*?<\/a>/g;
const PATH = /href="(\/portfolio\/[^"]+)"/;
// the card prints the sector over the write-up and the name under it
const SECTOR = /uppercase text-white\/70">([\s\S]*?)<\/span>/;
const NAME = /<span>([\s\S]*?)<\/span><span aria-hidden/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*>\s*<span>View website<\/span>/;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a sector written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchSite(path: string): Promise<string> {
	const url = `${BASE_URL}${path}`;
	try {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return url;
		return clean((await resp.text()).match(SITE)?.[1] ?? '') || url;
	} catch {
		return url;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const found: { name: string; category: string; path: string }[] = [];
	const seen = new Set<string>();
	for (const card of html.match(CARD) ?? []) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		const path = card.match(PATH)?.[1] ?? '';
		if (!name || !path || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		found.push({ name, category: tag(card.match(SECTOR)?.[1] ?? ''), path });
	}
	if (found.length === 0) {
		throw new Error('northstar: no companies in the portfolio');
	}

	const companies: ScrapedCompany[] = [];
	for (let start = 0; start < found.length; start += BATCH_SIZE) {
		const batch = found.slice(start, start + BATCH_SIZE);
		const sites = await Promise.all(batch.map((entry) => fetchSite(entry.path)));
		batch.forEach((entry, index) => {
			companies.push({ name: entry.name, category: entry.category, url: sites[index] });
		});
	}

	return companies;
}
