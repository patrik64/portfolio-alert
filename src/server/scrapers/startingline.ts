import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.startingline.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, a grid of image blocks. the fund uploaded almost every logo
// under the same filename, "PortCo Template.png", and gave none of them alt
// text, so the only writing about a company is the caption beneath it and the
// address the logo links to.
//
// the caption is a sentence, but it often opens with the company: "Made in
// Cookware is a direct to consumer...", "Clyde enables e-commerce brands...".
// so the leading words are taken when the company's own domain begins or ends
// with them, which finds Made in Cookware in madeincookware.com and Clyde in
// joinclyde.com. otherwise the domain names the company itself.
//
// a dozen logos are linked to nothing at all, and half of those captions never
// write the company's name — "Talent is distributed. Opportunity is not." — so
// there is nothing to identify them by, and they are left out rather than
// guessed at.
//
// a caption closes on a sale where there was one, "(Acquired by Mars for
// nearly $1B in 2021.)", "(Acq. by Later in 2024)", which gives the buyer
// and the Exited tag. squarespace renames the block's classes now and then
// (october 2026 put "website-component-block" among them), so a block is
// known by the one class that stays, sqs-block-image.

const BLOCK = /(?=<div class="sqs-block\b[^"]*\bsqs-block-image\b[^"]*")/;
const SITE = /<a[^>]*href="(https?:\/\/[^"]+)"/;
const CAPTION = /<div class="image-caption">([\s\S]*?)<\/div>/;
// "(Acquired by Mars for nearly $1B in 2021.)", "(Acq by Postscript in 2024)"
const SALE = /\(\s*acq(?:uired|\.)?\s+by\s+(.+?)(?:\s+(?:in|for)\b[^)]*)?\s*\.?\s*\)\.?\s*$/i;
const SUFFIX = /^(co|com)$/i;
const MAX_NAME_WORDS = 5;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#8220;|&#8221;/g, '"')
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

function domainLabel(url: string): string {
	let hostname: string;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
	const parts = hostname.split('.').filter((p) => p !== 'www');
	if (parts.length < 2) return parts[0] ?? '';
	if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) return parts[parts.length - 3];
	return parts[parts.length - 2];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const block of html.split(BLOCK).slice(1)) {
		const site = block.match(SITE)?.[1] ?? '';
		const label = domainLabel(site);
		// nothing links here and nothing names it
		if (!label) continue;

		const caption = clean(block.match(CAPTION)?.[1] ?? '');
		const buyer = caption.match(SALE)?.[1].trim() ?? '';
		const words = caption
			.replace(/[,.;:]/g, ' ')
			.split(/\s+/)
			.filter(Boolean);

		// the longest run of leading caption words the domain opens or closes
		// with; a shorter one like "the" would match anywhere inside it
		let name = '';
		const labelKey = key(label);
		for (let i = Math.min(MAX_NAME_WORDS, words.length); i > 0; i--) {
			const run = key(words.slice(0, i).join(''));
			if (run.length >= 2 && (labelKey.startsWith(run) || labelKey.endsWith(run))) {
				name = words.slice(0, i).join(' ');
				break;
			}
		}
		if (!name) name = capitalize(label.replace(/-+/g, ' '));

		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: buyer ? `Acquired by ${buyer}, Exited` : '',
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('startingline: no companies on the portfolio page');
	}

	return companies;
}
