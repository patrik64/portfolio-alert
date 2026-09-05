import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.laconiacapitalgroup.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, two logo galleries — Current Investments and Legacy
// Investments — whose slides tuck everything into an escaped
// data-description attribute: a sentence that opens with the company's name,
// linked to its own address while the fund still points anywhere. the name
// is the sentence's opening link or bold words; a slide whose description is
// an empty paragraph names nothing and is left out. legacy entries are
// tagged as such — the fund does not say which were exits and which just
// ran their course.

const GALLERY = 'sqs-gallery-container';
const SLIDE = 'class="slide" data-type="image"';
const DESCRIPTION = /data-description="([^"]*)"/;
const NAME_LINK = /<a href="(https?:[^"]+)"[^>]*>\s*(?:<strong>)?([^<]+)/;
const BOLD = /<strong>([^<]+)<\/strong>/;

const unescape = (s: string) =>
	s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const galleries = html.split(GALLERY).slice(1);
	for (const [index, gallery] of galleries.entries()) {
		for (const slide of gallery.split(SLIDE).slice(1)) {
			const description = unescape(slide.match(DESCRIPTION)?.[1] ?? '');
			const link = description.match(NAME_LINK);
			const name = clean(link?.[2] ?? description.match(BOLD)?.[1] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			companies.push({
				name,
				category: index > 0 ? 'Legacy investment' : '',
				url: link?.[1] ?? ''
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('laconia: no companies in the portfolio galleries');
	}

	return companies;
}
