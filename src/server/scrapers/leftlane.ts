import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.leftlane.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page, but the cards never name
// their companies outright: each carries a logo, a description that opens
// with the name, a link to the company's own address, a region, industry
// tags, and an EXITED or IPO label on the ones the fund is out of. so the
// name comes from the link's domain, and the description (or failing that
// the logo's filename) is allowed to correct it where its opening words
// spell the domain — the freshly written sentence is a better source of
// spacing and capitals than redstick's filename rule alone, and a first word
// that merely extends or tails the domain (Genius.ai over genius.com, Olipop
// over drinkolipop.com) still counts.

const CARD = 'class="showcase-block"';
const DESCRIPTION = /showcase-description-copy">([\s\S]*?)<\/p>/;
const LOGO = /<img src="([^"]+)"[^>]*class="showcase-block__logo"/;
const SITE = /href="(https?:\/\/[^"]+)" target="_blank"/;
// the hidden "All" rows carry a class between the field name and the value,
// so these only see the real tags
const TAG = /fs-cmsfilter-field="tag">([^<]*)</g;
const LOCATION = /fs-cmsfilter-field="location"[^>]*class="body-xxs[^>]*>([^<]*)</;
const STATE = /(?:showcase__state-label|class="position)">([^<]*)</;

// verbs a company puts in front of its brand to get a free .com
const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'trust', 'go', 'my'];
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

function domainLabel(hostname: string): string {
	const parts = hostname.replace(/^www\./, '').split('.');
	if (parts.length < 2) return parts[0] ?? '';
	if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) return parts[parts.length - 3];
	return parts[parts.length - 2];
}

const words = (text: string) => text.split(/[^A-Za-z0-9'&.]+/).filter(Boolean);

// the words the text opens with, if together they spell the label
function spelledOut(text: string, label: string): string {
	const ws = words(text);
	let spelled = '';
	for (let i = 0; i < ws.length; i += 1) {
		spelled += key(ws[i]);
		if (spelled === label) return ws.slice(0, i + 1).join(' ');
		if (!label.startsWith(spelled)) break;
	}
	return '';
}

// the text's first word alone, if it extends the label or is the tail or
// head of it — a brand that outgrew or never fully matched its domain
function firstWordNear(text: string, label: string): string {
	const word = words(text)[0] ?? '';
	const k = key(word);
	if (k.length >= 4 && (k.startsWith(label) || label.startsWith(k) || label.endsWith(k))) {
		return word;
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const site = card.match(SITE)?.[1];
		if (!site) continue;
		let label: string;
		try {
			label = domainLabel(new URL(site).hostname.toLowerCase());
		} catch {
			continue;
		}
		const bare = DECORATION.find(
			(d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND
		);
		const stripped = bare ? label.slice(bare.length) : label;

		const description = clean(card.match(DESCRIPTION)?.[1] ?? '');
		const file = decodeURIComponent(card.match(LOGO)?.[1]?.split('/').pop() ?? '')
			.replace(/^[0-9a-f]{16,}_/, '')
			.replace(/\.\w+$/, '')
			.replace(/\+/g, ' ');
		const name =
			spelledOut(description, label) ||
			spelledOut(description, stripped) ||
			spelledOut(file, label) ||
			spelledOut(file, stripped) ||
			firstWordNear(description, label) ||
			capitalize(stripped);
		if (!name || seen.has(key(name))) continue;
		seen.add(key(name));

		const state = clean(card.match(STATE)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...[...card.matchAll(TAG)].map((m) => tag(m[1])).filter((t) => t !== 'All'),
				tag(card.match(LOCATION)?.[1] ?? ''),
				/exited/i.test(state) ? 'Exited' : tag(state)
			]
				.filter(Boolean)
				.join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('leftlane: no companies on the page');
	}

	return companies;
}
