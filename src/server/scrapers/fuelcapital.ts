import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fuelcapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace galleries of logos, one under each heading — "Consumer",
// "Developer Tools & Infrastructure", "SaaS" — each logo linking the
// company's site and named by its label, or by its alt text when the label
// is missing. the companies featured "In the Spotlight" are filed under
// nothing, the heading saying only that they are shown first. under
// "Acquisitions" each logo's alt text says who bought it ("Tenor acquired by
// Google"), kept with the Exited tag, and the logo links the news of it, or
// nothing. a logo carrying only its file's name for alt text ("VOLT_Logo_
// Signature.png") is named from the file.

const BLOCK = /(?=<div class="sqs-block )/;
const GALLERY = /data-sqsp-block="gallery"/;
const HTML_BLOCK = /\bhtml-block\b/;
const SLIDE = /(?=<div class="slide[\s"])/;
const ANCHOR = /<a\b[^>]*>/;
const THUMB = /<img\b[^>]*class="thumb-image"[^>]*>/;
const SPOTLIGHT = /spotlight/i;
const EXITS = /acquisition|exit/i;
// "CoreOS acquired by Red Hat", or just "Acquired by Wealthfront"
const SOLD = /^(.*?)\s*\b(acquired by .+)$/i;
const FILE_NAME = /\.(png|jpe?g|gif|webp|svg)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const attr = (element: string, name: string) =>
	unescape(element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '');

// "VOLT_Logo_Signature.png" -> "VOLT", "Prelude_Main_CMYK copy.jpg" ->
// "Prelude", "upwards.png" -> "Upwards"
function fileName(src: string): string {
	const file = decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
		.replace(/\+/g, ' ')
		.replace(FILE_NAME, '')
		.split('_')[0]
		.replace(/\s+copy$/i, '')
		.replace(/\s*logo$/i, '')
		.trim();
	return file && file === file.toLowerCase() ? file[0].toUpperCase() + file.slice(1) : file;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let heading = '';
	for (const block of html.split(BLOCK).slice(1)) {
		const opening = block.match(/^<div\b[^>]*>/)?.[0] ?? '';
		if (!GALLERY.test(opening)) {
			// a heading is a text block short enough to be one
			const text = HTML_BLOCK.test(opening)
				? clean(block.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' '))
				: '';
			if (text && text.length <= 60) heading = text;
			continue;
		}
		const exits = EXITS.test(heading);
		for (const slide of block.split(SLIDE).slice(1)) {
			const anchor = slide.match(ANCHOR)?.[0] ?? '';
			const image = slide.match(THUMB)?.[0] ?? '';
			const label = attr(anchor, 'aria-label');
			const alt = attr(image, 'alt');
			const sold = exits ? alt.match(SOLD) : null;
			const written = sold ? sold[1] : label || (FILE_NAME.test(alt) ? '' : alt);
			const name = clean(written) || fileName(attr(image, 'data-src'));
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const link = attr(anchor, 'href') || attr(slide.slice(0, 400), 'data-click-through-url');
			const note = sold ? tag(sold[2]) : '';
			companies.push({
				name,
				category: [
					exits || SPOTLIGHT.test(heading) ? '' : tag(heading),
					note ? `${note[0].toUpperCase()}${note.slice(1)}` : '',
					exits ? 'Exited' : ''
				]
					.filter(Boolean)
					.join(', '),
				url: /^https?:\/\//.test(link) ? link : ''
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('fuelcapital: no logos in the portfolio galleries');
	}

	return companies;
}
