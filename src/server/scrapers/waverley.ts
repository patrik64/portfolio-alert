import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.waverleycapital.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace gallery: one clickthrough logo per company, and nothing else —
// ?format=json returns an empty page body, because the gallery is a block.
//
// the logos are the only place a company is named ("The+Athletic.png"), since
// the alt text carries the status instead ("Acquired by Cisco", "Nasdaq: KLTR")
// and an acquired company's link points at its acquirer's site, not its own —
// so the hostname can name nobody here, it can only confirm a filename.

const ITEM = /class="gallery-grid-item has-clickthrough"([\s\S]*?)<\/a>/g;
const IMAGE = /data-image="[^"]*\/([^/"?]+)\.(?:png|jpe?g|svg|webp|gif)"/i;
const HREF = /href="\s*(https?:\/\/[^"\s]+)"/;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// the filename is the name, once squarespace's escaping and a "logo" suffix
// are undone. what remains may still carry a file version ("Wondery3") — but
// "Art19" wears its digits for real, so a trailing run of them goes only when
// dropping it is what makes the name echo the company's own hostname.
function nameFor(file: string, host: string): string {
	const cleaned = decodeURIComponent(file.replace(/\+/g, ' '))
		.replace(/\s*logo\s*$/i, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!host || key(cleaned).length < 2) return cleaned;

	if (host.includes(key(cleaned))) return cleaned;
	// try the shorter readings: a trailing file version, then trailing words
	const candidates = [cleaned.replace(/\d+$/, '').trim()];
	const words = cleaned.split(' ');
	for (let take = words.length - 1; take > 0; take--) {
		candidates.push(words.slice(0, take).join(' '));
	}
	for (const candidate of candidates) {
		if (key(candidate).length > 1 && host.includes(key(candidate))) return candidate;
	}
	return cleaned;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, item] of html.matchAll(ITEM)) {
		const file = item.match(IMAGE)?.[1];
		if (!file) continue;
		const url = item.match(HREF)?.[1] ?? '';
		const host = url ? key(new URL(url).hostname.replace(/^www\./, '')) : '';
		const name = nameFor(file, host);
		if (!name || seen.has(name)) continue;
		seen.add(name);

		// the alt text is the status where there is one, and a copy of the
		// filename where there is not
		const alt = (item.match(/alt="([^"]+)"/)?.[1] ?? '').trim();
		const tags: string[] = [];
		if (/^acquired\b/i.test(alt)) tags.push('Acquired');
		else if (/^(nyse|nasdaq)\b/i.test(alt)) tags.push('Exited');

		companies.push({ name, category: tags.join(', '), url });
	}

	if (companies.length === 0) {
		throw new Error('waverley: no companies on the page');
	}

	return companies;
}
