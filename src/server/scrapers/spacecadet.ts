import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://spacecadet.ventures/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the portfolio grouped under six headings. a card links to the
// company, shows its logo, and captions it with what it does — "Supersonic
// Passenger Airplanes" — so the caption is a description, not a name.
//
// the name is the logo's filename, which the fund keeps tidy: Boom.svg,
// StarfishSpace.png, ParallelBio.svg. it is trusted over the link because
// several of the links are wrong — function health's points at trl11.com,
// loyal's at 1337.org, quilt's at aptamino.com — while the filenames beside
// them are right.
//
// where the filename and the company's own domain do agree, the domain
// confirms the letters and the run-together words are parted, which is what
// makes Starfish Space out of StarfishSpace. one logo was saved as "Group
// 21804" and names nobody, so its domain stands in.

const CARD = /<a class="card"[^>]*href="([^"]*)"[\s\S]*?<img class="logoImg" src="([^"]*)"/g;
const HEADING = /<h2\s+class="category">([^<]*)<\/h2>/g;
// what a design tool calls a file when nobody renames it
const UNNAMED = /^(group|image|asset|frame|rectangle|layer)[\s_-]*\d*$/i;
// the copy number a logo picks up: "Cassidy-01", "Prophetic-01-01"
const COUNTER = /(?:[-_ ]0?\d+)+$/;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const headings = [...html.matchAll(HEADING)].map((m) => ({ at: m.index, text: clean(m[1]) }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(CARD)) {
		const site = m[1];
		let hostname = '';
		try {
			hostname = new URL(site).hostname.replace(/^www\./, '').toLowerCase();
		} catch {
			hostname = '';
		}

		const file = decodeURIComponent(m[2].split('/').pop() ?? '')
			.replace(/\.\w+$/, '')
			.replace(COUNTER, '')
			.trim();

		let name: string;
		if (!file || UNNAMED.test(file)) {
			name = capitalize(hostname.split('.')[0] ?? '');
		} else if (key(file) && key(hostname).includes(key(file))) {
			name = capitalize(file.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
		} else {
			name = capitalize(file);
		}

		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: headings.filter((h) => h.at < m.index).pop()?.text ?? '',
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('spacecadet: no companies on the portfolio page');
	}

	return companies;
}
