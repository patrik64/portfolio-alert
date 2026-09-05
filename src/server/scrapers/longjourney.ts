import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.longjourney.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, a wall of logos and nothing else: no names in the markup, no
// sectors, empty alt text, and half the logo files are called "blank (n)".
// what is unambiguous is each picture's link, which is the company's own
// address, so the name comes from that domain. the filename is only allowed
// to correct the domain: where its opening words spell the domain exactly,
// they supply the spacing and capitals the domain dropped — the same rule
// redstick used over the same kind of wall.

const IMAGE_LINK = /sqs-block-image-link[\s\S]{0,600}?href="(https?:\/\/[^"]+)"[\s\S]{0,900}?data-src="([^"]+)"/g;
// verbs a company puts in front of its brand to get a free .com
const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|sg|in|corp|shop|about|info|partner)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

function domainLabel(hostname: string): string {
	const parts = hostname.split('.').filter((p) => !SUBDOMAIN.test(p));
	if (parts.length < 2) return parts[0] ?? '';
	if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) return parts[parts.length - 3];
	return parts[parts.length - 2];
}

// the words the filename opens with, if together they spell the domain
function spelledOut(file: string, label: string): string {
	const words = file.split(/[^A-Za-z0-9]+/).filter(Boolean);
	let spelled = '';
	for (let i = 0; i < words.length; i += 1) {
		spelled += key(words[i]);
		if (spelled === label) return words.slice(0, i + 1).join(' ');
		if (!label.startsWith(spelled)) break;
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
	for (const m of html.matchAll(IMAGE_LINK)) {
		const site = m[1];
		let label: string;
		try {
			label = domainLabel(new URL(site).hostname.toLowerCase());
		} catch {
			continue;
		}
		const bare = DECORATION.find(
			(d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND
		);
		if (bare) label = label.slice(bare.length);
		if (!label || seen.has(label)) continue;
		seen.add(label);

		const file = decodeURIComponent(m[2].split('/').pop() ?? '')
			.replace(/\.\w+$/, '')
			.replace(/\+/g, ' ');
		companies.push({
			name: capitalize(spelledOut(file, label) || label),
			category: '',
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('longjourney: no companies on the portfolio page');
	}

	return companies;
}
