import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.10d.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;|&#8217;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the portfolio page (WordPress) never prints a company name: the current
// investments carry an industry, a description that opens with the name, and
// the site (in an unquoted href); the "previous investment history" is logo
// tiles with just a link and an M&A/IPO tag. names are taken from the
// description's leading words, or derived from the domain

function nameFromUrl(url: string): string {
	const host = url
		.replace(/^https?:\/\//, '')
		.split('/')[0]
		.replace(/^www\./, '');
	const base = host.split('.')[0];
	return base
		.split(/[-_]/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

// leading capitalised words ("Quantum Source is…" -> "Quantum Source"), with
// two escapes: a lowercase brand that matches the site stem ("bananaz is…"),
// and a runaway grab of four+ words, where the domain is the safer bet
function nameFromDescription(desc: string, url: string): string {
	const words = desc.split(/\s+/);
	const first = (words[0] ?? '').replace(/[’']s$/, '').replace(/[.,:;]+$/, '');
	const stem = url.replace(/^https?:\/\/(www\.)?/, '').split('.')[0];
	if (/^[a-z]/.test(first) && stem.toLowerCase().startsWith(first.toLowerCase())) return first;
	const taken: string[] = [];
	for (const word of words) {
		if (/^[A-Z0-9]/.test(word)) taken.push(word.replace(/[’']s$/, '').replace(/[.,:;]+$/, ''));
		else break;
	}
	const name = taken.join(' ');
	if (!name || name.length > 40 || taken.length >= 4) return url ? nameFromUrl(url) : name;
	return name;
}

function editDistance(a: string, b: string): number {
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++)
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
	return d[a.length][b.length];
}

// history tiles name their company only in the logo filename — which catches
// the tiles whose link points at the acquirer (Indegy under tenable.com,
// Magisto under a vimeo redirect) but is occasionally typo'd ("Wazw"). when
// filename and domain nearly agree, the domain is the cleaner spelling
function historyName(logo: string, url: string): string {
	const stem = logo.replace(/-\d+$/, '');
	const clean = /^[A-Za-z][A-Za-z-]*$/.test(stem);
	if (!clean) return url ? nameFromUrl(url) : '';
	const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
	const host = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
	if (url && editDistance(norm(stem), norm(host.split('.')[0])) <= 2) return nameFromUrl(url);
	return stem
		.split('-')
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const [, mainList, historyList = ''] = html.split(/<ul class="investments-(?:history-)?list">/);
	if (!mainList) {
		throw new Error('10d: no investments list on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];

	for (const item of mainList.split('<li style="background:').slice(1)) {
		const url = (item.match(/<a class="relative" href=("?)(https?:\/\/[^\s">]+)\1/)?.[2] ?? '').replace(/\/$/, '');
		const desc = decode((item.match(/description caption-small_secondary">([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/<[^>]+>/g, ''));
		const name = nameFromDescription(desc, url);
		if (!name) continue;
		const industry = decode((item.match(/Industry:\s*<strong>([\s\S]*?)<\/strong>/)?.[1] ?? '').replace(/<[^>]+>/g, ''));
		const tag = decode(item.match(/tag status[^"]*">\s*([\s\S]*?)\s*<\/p>/)?.[1] ?? '');
		companies.push({ name, category: [industry, tag].filter(Boolean).join(', '), url });
	}

	for (const item of historyList.split('<li>').slice(1)) {
		const url = (item.match(/href=("?)(https?:\/\/[^\s">]+)\1/)?.[2] ?? '').replace(/\/$/, '');
		const logo = item.match(/uploads\/[^"']*\/([^"'/]+)\.(?:svg|png|jpe?g|webp)/)?.[1] ?? '';
		const name = historyName(logo, url);
		if (!name) continue;
		const tag = decode(item.match(/tag status[^"]*">\s*([\s\S]*?)\s*<\/p>/)?.[1] ?? '');
		companies.push({
			name,
			category: ['Previous investment', tag].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('10d: no companies found on the portfolio page');
	}

	return companies;
}
