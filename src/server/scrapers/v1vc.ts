import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.v1.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace one-pager, rebuilt in september 2026: the companies are a logo
// gallery under a "Companies" heading, each slide linking the company's own
// site with the company's name as the link's label — the site names them
// itself now, where it used to leave only a template filename and the
// hostname to go by. a second gallery lower down holds a partner's prior
// investments, which are not the fund's and are left alone.

const GALLERY = 'sqs-gallery-container';
const HEADING = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/g;
const SLIDE = 'class="slide"';
const SITE = /href="(https?:\/\/[^"]+)"/;
const LABEL = /aria-label="([^"]*)"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the gallery is the one a "Companies" heading introduces
function companiesGallery(html: string): string | undefined {
	const parts = html.split(GALLERY);
	for (let i = 1; i < parts.length; i++) {
		const headings = [...parts[i - 1].slice(-3000).matchAll(HEADING)].map((m) => clean(m[1]));
		if (/^companies$/i.test(headings.at(-1) ?? '')) return parts[i];
	}
	return undefined;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const gallery = companiesGallery(await resp.text());
	if (!gallery) {
		throw new Error('v1vc: no companies gallery on the homepage');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const slide of gallery.split(SLIDE).slice(1)) {
		const href = slide.match(SITE)?.[1];
		const name = clean(slide.match(LABEL)?.[1] ?? '');
		if (!href || !name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// URL normalizes the site's occasional capitalized hostnames
		companies.push({ name, category: '', url: new URL(href).href });
	}

	if (companies.length === 0) {
		throw new Error('v1vc: no companies in the homepage gallery');
	}

	return companies;
}
