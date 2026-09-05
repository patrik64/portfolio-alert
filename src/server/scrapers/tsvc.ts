import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.tsvcap.com/portfolio-new';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, but hand-built rather than driven by a collection: the logos
// are background images the stylesheet hangs on a class per company, so the
// markup carries no image and no alt at all. what it does carry is that class
// — "link-company carta", "link-company more-companies exa-labs" — which is
// the fund's own name for the company, and is what names it here. five of them
// also print the name as text, and that is preferred where it is there.
//
// the companies sit under four headings, and a company belongs to whichever it
// follows. "Other highlights" groups nothing in particular and becomes no tag.

const ANCHOR =
	/<a href="(https?:\/\/[^"]+)"[^>]*class="link-company ([^"]*)w-inline-block"[^>]*>([\s\S]{0,300}?)<\/a>/g;
const HEADING = />(IPO COMPANIES and UNICORNS|Centaurs \([^<]*\)|OTHER HIGHLIGHTS|AcquisitionS)</g;

const capitalize = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

// the headings are written for the page, not for a tag
function tagFor(heading: string): string {
	if (/^acquisition/i.test(heading)) return 'Acquired';
	if (/^other highlights/i.test(heading)) return '';
	if (/^ipo/i.test(heading)) return 'IPO or Unicorn';
	if (/^centaurs/i.test(heading)) return 'Centaur';
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const sections = [...html.matchAll(HEADING)].map((m) => ({ at: m.index, tag: tagFor(m[1]) }));
	if (sections.length === 0) {
		throw new Error('tsvc: the portfolio no longer groups its companies');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ANCHOR)) {
		const [, url, classes, body] = m;
		// "more-companies" is a layout class the fund puts on the smaller logos
		const slug = classes
			.split(/\s+/)
			.filter((c) => c && c !== 'more-companies')
			.join(' ');
		const text = body.replace(/<[^>]+>/g, '').trim();
		const name = text || capitalize(slug.replace(/-/g, ' '));
		if (!name || seen.has(name)) continue;
		seen.add(name);

		// the last heading before this anchor is the group it is in
		const tag = sections.filter((s) => s.at < m.index).pop()?.tag ?? '';
		companies.push({ name, category: tag, url });
	}

	if (companies.length === 0) {
		throw new Error('tsvc: no companies on the portfolio page');
	}

	return companies;
}
