import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://jazzvp.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the portfolio on the front page as a wall of logo links, each
// classed with its sector (health or productivity) and holding a description
// that opens with the company's name — an acquired company loses its link
// and gains an ACQUIRED prefix instead. the anchor's id is the name in
// lowercase, so the description (or failing that the link's domain) supplies
// the spacing and capitals, the way left lane's wall is read.

const ITEM = /<a\s+id="([^"]+)"\s+class="portfolio-link-item[^"]*?(\w+)"[\s\S]*?href="([^"]*)"[\s\S]*?<\/a>/g;
const DESCRIPTION = /<div class="info-box">[\s\S]*?<p>([\s\S]*?)<\/p>/;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

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

// the text's first word alone, if it extends the label or is its head or tail
function firstWordNear(text: string, label: string): string {
	const word = words(text)[0] ?? '';
	const k = key(word);
	if (k.length >= 3 && (k.startsWith(label) || label.startsWith(k) || label.endsWith(k))) {
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
	for (const m of html.matchAll(ITEM)) {
		const [block, id, sector, href] = m;
		const site = /^https?:/.test(href) ? href : '';
		const raw = clean(block.match(DESCRIPTION)?.[1] ?? '');
		const exited = /^ACQUIRED\b/.test(raw);
		const description = raw.replace(/^ACQUIRED\.?\s*/, '');

		const label = site ? domainLabel(new URL(site).hostname.toLowerCase()) : key(id);
		const name =
			spelledOut(description, label) ||
			spelledOut(description, key(id)) ||
			firstWordNear(description, label) ||
			capitalize(key(id));
		if (!name || seen.has(key(name))) continue;
		seen.add(key(name));

		companies.push({
			name,
			category: [clean(sector), exited ? 'Exited' : '']
				.filter(Boolean)
				.map((t) => t.charAt(0).toUpperCase() + t.slice(1))
				.join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('jazz: no companies on the page');
	}

	return companies;
}
