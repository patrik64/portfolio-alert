import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.manaventures.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 20;

// webflow, a hundred companies to a page, and the fund keeps its own pages
// rather than filtering in the browser, so each is followed from the one
// before by the link at the foot of the wall.
//
// a tile is a logo, a link out and the fund's sectors, and the company is not
// written anywhere on it. so it is named the way an unlabelled wall has to be:
// by the file the fund uploaded where that and the address spell something of
// each other — standard bots for standardbots.com, arda therapeutics for
// ardatx.com — and by the address where they do not. what a designer leaves in
// a file name comes off it first: webflow's own asset id, the layer it was cut
// from (logo=, Company=), and the words logo, white, scaled.
//
// two companies have no site of their own and are linked through the page they
// keep on linkedin, which names them in its own address rather than in its
// host, and one is reached through a form it keeps on typeform, where the
// company is the name in front of the host rather than the host itself.
//
// Spotlight is the fund's way of putting a company at the front of its own
// wall rather than anything about the company, so it is not kept as a sector.

const ITEM = /(?=<div[^>]*\bclass="blog4_item w-dyn-item")/;
const LINK = /<a\b[^>]*?\bhref="([^"]*)"[^>]*class="blog4_item-link/;
const LOGO = /<img[^>]*?\bsrc="([^"]*)"[^>]*class="blog4_image"/;
const SECTOR = /fs-cmsfilter-field="categories"[^>]*>([^<]*)<\/div>/g;
const NEXT = /<a\b[^>]*?\bhref="([^"]*)"[^>]*class="w-pagination-next"/;

// what webflow and a designer leave around a file's own name
const ASSET_ID = /^[0-9a-f]{24}_/;
const LAYER = /^[A-Za-z ]{1,12}=/;
const SIZED = /@\d+x|-p-\d+|\(\d+\)/g;
const NOISE = /\b(?:logos?|white|black|transparent|final|copy|scaled|cropped)\b/gi;
// second levels that are not the brand
const GENERIC = new Set(['com', 'co', 'net', 'org', 'io', 'ai', 'app', 'life', 'vc', 'tech', 'inc']);
const PROFILE = /^(?:www\.)?linkedin\.com$/i;
// the fund's own front, not a company's
const FRONT = 'Spotlight';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const titled = (s: string) =>
	(s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s).replace(
		/\bAi\b/g,
		'AI'
	);

const fromFile = (src: string) => {
	let file = decodeURIComponent(src.split('?')[0].split('/').pop() ?? '');
	file = file.replace(/\.[a-z0-9]+$/i, '').replace(ASSET_ID, '').replace(LAYER, '');
	return clean(file.replace(SIZED, ' ').replace(/[-_]+/g, ' ').replace(NOISE, ' '));
};

const domainOf = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, '').replace(/\.[a-z]+$/i, '');
	} catch {
		return '';
	}
};

const fromHost = (url: string) => {
	try {
		const { hostname, pathname } = new URL(url);
		// a company reached through its page on linkedin is named by that page
		if (PROFILE.test(hostname)) {
			return clean((pathname.split('/').filter(Boolean)[1] ?? '').replace(/-+/g, ' '));
		}
		const labels = hostname.replace(/^www\./, '').split('.');
		if (labels.length > 1) labels.pop();
		if (labels.length > 1 && GENERIC.has(labels[labels.length - 1])) labels.pop();
		return labels[labels.length - 1] ?? '';
	} catch {
		return '';
	}
};

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let next: string | undefined = PAGE_URL;
	for (let page = 0; next && page < MAX_PAGES; page++) {
		const at: string = next;
		const html = await fetchText(at);

		for (const item of html.split(ITEM).slice(1)) {
			const url = item.match(LINK)?.[1] ?? '';
			if (!/^https?:\/\//i.test(url)) continue;

			const stem = fromFile(item.match(LOGO)?.[1] ?? '');
			const host = fromHost(url);
			// the file is believed where it and the address spell something of each
			// other, or where the address only carries on from the word it opens
			// with, and only when it says enough to be a name
			const opening = key(stem.split(' ')[0] ?? '');
			const spelled =
				key(stem).length >= 4 &&
				(key(domainOf(url)).includes(key(stem)) ||
					key(stem).includes(key(host)) ||
					(opening.length >= 4 && key(host).startsWith(opening)));
			let name = titled(spelled ? stem : host);
			// a file that spelled the address out, dot and all, has the fund's own
			// .ai on the end of it rather than the company's last word
			if (key(name) === `${key(host)}ai` && /\.ai$/i.test(new URL(url).hostname)) {
				name = `${titled(host)} AI`;
			}
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			const sectors = [...item.matchAll(SECTOR)]
				.map((sector) => clean(sector[1]))
				.filter((sector) => sector && sector !== FRONT);

			companies.push({ name, category: sectors.join(', '), url });
		}

		const link = html.match(NEXT)?.[1];
		next = link ? new URL(link, at).href : undefined;
	}

	if (companies.length === 0) {
		throw new Error('mana: no companies on the portfolio wall');
	}

	return companies;
}
