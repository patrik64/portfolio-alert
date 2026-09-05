import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.originventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace. the portfolio is a wall of logos: a company is a picture linked
// to its own site with a line about what it does written under it, and its
// name only inside the artwork. so the page publishes no name as text, and the
// three places the fund does write one down are none of them complete —
//
//   the carousel above the wall, which names the eight it is featuring;
//   the file a logo was uploaded under, which is the company's name for two
//     thirds of them and "Untitled design (3)" for the rest;
//   the line under the logo, which opens on the name about as often as it
//     opens on a sentence.
//
// so all three are read, and none is believed on its own: a candidate becomes
// the name only where the address the logo links to confirms it — "Tock" for
// exploretock.com, "Veho" for shipveho.com. a line opening "Better last-mile
// delivery experience" names nobody, and neither does a logo filed under
// "Untitled design", so neither can put a wrong name on a company. what the
// confirming costs is a company whose brand is not in its own address: the
// fund's stake in Pie points at the app store rather than at a site of its
// own, so it is left out along with the two the fund names nowhere at all.
//
// the fund files a company under nothing — no sector, no stage, no status, on
// the wall or anywhere else on the page — so every company here is left with
// no category.

const FIGURE = /<figure class="gallery-grid-item[\s\S]*?<\/figure>/g;
const HREF = /<a\s[^>]*\bhref="([^"]+)"/;
const LOGO = /\bdata-src="([^"]+)"/;
const CAPTION = /<p class="gallery-caption-content">([\s\S]*?)<\/p>/;
// the carousel keeps the eight it features in its section's context
const FEATURED = /data-current-context="([^"]*userItems[^"]*)"/;
// the fund names some logo files after the company and the word logo, run
// together as often as not — h3xlogo. the trimmed name is only tried after the
// whole one, so a company actually called Catalogo keeps its name
const LOGO_WORD = /[\s_-]*logos?$/i;
// squarespace adds a counter to a file uploaded twice
const COUNTER = /\s*\(\d+\)$/;

interface Featured {
	userItems?: { title?: string }[];
}

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s).replace(/\s+/g, ' ').trim();

// a name and an address are compared on their letters and digits alone, so
// that "Tock" can be found in exploretock.com and "Prisidio" in prisid.io
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const host = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./i, '');
	} catch {
		return '';
	}
};

// the fund writes a caption as a sentence, so the name — where it opens on one
// — is the first word or three of it
const opening = (caption: string) => {
	const words = caption.split(' ').filter(Boolean);
	return [3, 2, 1]
		.filter((n) => words.length >= n)
		.map((n) => words.slice(0, n).join(' ').replace(/['’]s$/i, '').replace(/[,.;:]+$/, ''));
};

const fromLogo = (url: string) => {
	const file = decodeURIComponent((url.split('/').pop() ?? '').replace(/\+/g, ' '));
	const stem = clean(file.replace(/\.[a-z0-9]+$/i, '')).replace(COUNTER, '');
	return [stem, stem.replace(LOGO_WORD, '')];
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the carousel is read first, so a name the fund typed out beats one taken
	// off a filename — its Voze over the logo's voze
	let featured: string[] = [];
	const context = html.match(FEATURED)?.[1];
	if (context) {
		try {
			featured = ((JSON.parse(un(context)) as Featured).userItems ?? [])
				.map((item) => clean(item.title ?? ''))
				.filter(Boolean);
		} catch {
			featured = [];
		}
	}

	const figures = html.match(FIGURE) ?? [];
	if (figures.length === 0) {
		throw new Error('origin: the portfolio is no longer a wall of logos');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const figure of figures) {
		const url = clean(figure.match(HREF)?.[1] ?? '');
		const site = host(url);
		if (!site) continue;

		const caption = clean((figure.match(CAPTION)?.[1] ?? '').replace(/<[^>]+>/g, ''));
		const candidates = [...featured, ...opening(caption), ...fromLogo(figure.match(LOGO)?.[1] ?? '')];

		// the letters an address ends on are not a name: a line opening "AI"
		// over an .ai address would otherwise be read as one
		const ending = key(site.split('.').pop() ?? '');
		const name = candidates.find((candidate) => {
			const k = key(candidate);
			return k.length > 0 && k !== ending && key(site).includes(k);
		});
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('origin: no companies in the portfolio');
	}

	return companies;
}
