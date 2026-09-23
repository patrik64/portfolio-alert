import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.futureperfectventures.com/invest';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix, rendered on the server: a matrix gallery of logos for each of the
// funds, each under its heading ("Fund I", "Fund II", "Fund III"). every logo
// links the company's site, with its name for a title and a line about it
// for a description; a company the fund is out of says "(Exited)" after its
// name. a company held from more than one fund shows in each gallery, spelled
// as the gallery spells it ("Token Ring", "TokenRing"), and is one company
// under every fund it appears in.

const HEADING = /class="[^"]*\bwixui-rich-text__text\b[^"]*"[^>]*>(?:<[^>]+>)*\s*(Fund [IVX]+)\s*</g;
const GALLERY = /id="(comp-[a-z0-9]+)" class="[^"]*\bwixui-gallery\b/g;
const ITEM = /(?=<div[^>]*class="[^"]*\bwixui-gallery__item\b)/;
const TITLE = /data-testid="gallery-item-title"[^>]*>([\s\S]*?)<\/div>/;
const LOGO = /<img\b[^>]*\balt="([^"]+)"/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const EXITED = /\s*\((exited|exit|acquired)\)\s*$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "Token Ring" and "TokenRing" are the one company
const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// each gallery, with the fund whose heading comes before it
	const headings = [...html.matchAll(HEADING)].map((m) => ({ at: m.index ?? 0, fund: clean(m[1]) }));
	const galleries = [...html.matchAll(GALLERY)].map((m) => m.index ?? 0);
	if (galleries.length === 0) {
		throw new Error('futureperfect: no galleries on the invest page');
	}

	const companies = new Map<string, ScrapedCompany & { labels: string[] }>();
	galleries.forEach((at, i) => {
		const fund = headings.filter((h) => h.at < at).at(-1)?.fund ?? '';
		const gallery = html.slice(at, galleries[i + 1] ?? html.length);
		for (const chunk of gallery.split(ITEM).slice(1)) {
			// an item is its link; the last would otherwise run on into the page
			const item = chunk.split('</a>')[0];
			const title = clean(item.match(TITLE)?.[1] || item.match(LOGO)?.[1] || '');
			const name = title.replace(EXITED, '').trim();
			if (!name || STEALTH.test(name)) continue;
			const exited = EXITED.test(title);
			const key = keyOf(name);
			const known = companies.get(key);
			const labels = [fund, exited ? 'Exited' : ''].filter(Boolean);
			if (known) {
				for (const label of labels) if (!known.labels.includes(label)) known.labels.push(label);
				if (!known.url) known.url = unescape(item.match(SITE)?.[1] ?? '');
				continue;
			}
			companies.set(key, { name, category: '', url: unescape(item.match(SITE)?.[1] ?? ''), labels });
		}
	});

	if (companies.size === 0) {
		throw new Error('futureperfect: no companies in the galleries');
	}

	// the exit comes after every fund the company is under
	return [...companies.values()].map(({ labels, ...company }) => ({
		...company,
		category: [...labels.filter((l) => l !== 'Exited'), labels.includes('Exited') ? 'Exited' : '']
			.filter(Boolean)
			.join(', ')
	}));
}
