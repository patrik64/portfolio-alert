import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.s3vc.com/companies-all';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace summary blocks. what each card writes as its title is what the
// company does — "UTERINE FIBROID TREATMENT" — and its url slug is mostly
// squarespace's own "blog-post-title-two-p6n5b-pl8ja", so neither names it.
//
// the logo filename does: Alkami.png, Atmosphere TV.png, Advanced Nano
// Therapies Card.png. the words the fund adds when saving them — card,
// company, logo — come off. one file was never renamed from "Untitled design",
// and there the read-more slug names the company instead.
//
// beneath each card sits its sector and city, and a tag where the company has
// been bought or floated. the tag is kept as the fund writes it, with any comma
// inside it folded so it stays one tag rather than two.

const ITEM = /(?=<div class="\s*summary-item\s)/;
const LOGO = /data-image="([^"]+)"/;
const READ_MORE = /href="\/portfolio-companies\/([^"?]+)"/;
const TAG = /summary-metadata-item--tags"><a[^>]*>([^<]*)<\/a>/g;
const EXCERPT = /summary-excerpt[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/;
// what the fund calls a logo file besides the company
const DRESSING = /^(card|company|logos?|new|final|copy|website|web|\d+|[0-9a-f]{8,})$/i;
// squarespace's own placeholder slugs, which name nobody
const PLACEHOLDER = /^blog-post-title/i;
const UNNAMED = /^untitled\b/i;
const COPY_NUMBER = /\s*\(\d+\)/g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

// a comma inside one tag would read as two once the tags are joined
const asTag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const file = decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '')
			.replace(/\.\w+$/, '')
			.replace(/\+/g, ' ')
			.replace(COPY_NUMBER, '');

		let name = UNNAMED.test(file.trim())
			? ''
			: file
					.split(/[\s_-]+/)
					.filter((w) => w && !DRESSING.test(w))
					.join(' ');

		if (!name) {
			const slug = item.match(READ_MORE)?.[1] ?? '';
			if (slug && !PLACEHOLDER.test(slug)) name = capitalize(slug.replace(/-+/g, ' '));
		}
		name = clean(name);
		if (!name || seen.has(name)) continue;
		seen.add(name);

		// the excerpt opens with the sector, sometimes two joined by + or &
		const sectors = clean((item.match(EXCERPT)?.[1] ?? '').split(/<br\s*\/?>/)[0])
			.split(/\s*[+&]\s*/)
			.map((s) => clean(s))
			.filter(Boolean);
		const tags = [...new Set([...item.matchAll(TAG)].map((m) => asTag(m[1])))].filter(Boolean);

		companies.push({
			name,
			category: [...sectors, ...tags].join(', '),
			url: ''
		});
	}

	if (companies.length === 0) {
		throw new Error('s3vc: no companies on the portfolio page');
	}

	return companies;
}
