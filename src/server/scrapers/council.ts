import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.thecouncil.co/fund-portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace gallery: linked logos, nothing else. the alt text is whatever
// the file was called when it was dragged in ("dirac (2).png", "2.png") except
// where the fund typed a note instead, and those notes are about how it came
// to hold the company rather than what the company is called.
//
// so the hostname names the company, and the filename is used only where the
// hostname bears it out.

const ITEM = 'class="gallery-grid-item';
const SITE = /href="(https?:\/\/[^"]+)"/;
const LOGO = /\/([^/"?]+)\.(?:png|jpe?g|svg|webp)/i;
const ALT = /alt="([^"]*)"/;
const ACQUIRED = /\bacqui?si|\bacquired\b/i;

const DRESSING = /^(logos?|png|jpe?g|copy|\d+)$/i;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const capitalize = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
};

function nameFor(file: string, url: string): string {
	const raw = hostLabel(url);
	const host = key(raw);
	const words = decodeURIComponent(file.replace(/\+/g, ' '))
		.split(/[^A-Za-z0-9]+/)
		.filter((w) => w && !DRESSING.test(w));

	for (let len = words.length; len > 0; len--) {
		for (let start = 0; start + len <= words.length; start++) {
			const run = words.slice(start, start + len);
			const k = key(run.join(''));
			if (k.length > 1 && host.includes(k)) return capitalize(run.join(' '));
		}
	}
	return capitalize(raw);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const url = item.match(SITE)?.[1];
		// the gallery's wrappers split alongside the items themselves
		if (!url) continue;
		const name = nameFor(item.match(LOGO)?.[1] ?? '', url);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			// where the fund noted how it came by the company, it says acquisition
			category: ACQUIRED.test(item.match(ALT)?.[1] ?? '') ? 'Acquired' : '',
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('council: no companies on the portfolio page');
	}

	return companies;
}
