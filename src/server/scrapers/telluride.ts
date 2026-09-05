import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://tellurideventurenetwork.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: logos grouped under the year the network took the company on.
// the logos carry no alt text, and their filenames are what the fund happened
// to save — a dozen of them are "Screen Shot at PM" and three share a
// placeholder — so the company's own hostname names it, and the filename is
// used only where the hostname bears it out.
//
// two links do not lead to a company's own site: one to its facebook page and
// one to a wix subdomain. the name is in the address either way, in the path
// or in the subdomain rather than the domain.

const ITEM = 'class="pix-brand-item"';
const SITE = /href="(https?:\/\/[^"]+)"/;
const LOGO = /\/uploads\/[^"]*?\/([^/"?]+)\.(?:png|jpe?g|svg|webp)/i;
const YEAR = /<h[1-3][^>]*>\s*(\d{4})\s*<\/h[1-3]>/g;

const DRESSING =
	/^(logos?|logotype|wordmark|mainlogo|final|new|web|colou?r|black|white|transparent|screen|shot|at|am|pm|vertical|banner|external|content|duckduckgo|\d+|[0-9a-f]{12,})$/i;
// sites that host a company rather than being one
const HOSTING = /^(wixsite|squarespace|myshopify|weebly|godaddysites)\.com$/i;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const capitalize = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

// the label that names the company: normally the domain, but the subdomain
// where the domain only hosts, and the path where the link is to a facebook page
function fromUrl(url: string): string {
	const { hostname, pathname } = new URL(url);
	const labels = hostname.replace(/^www\./, '').split('.');
	if (/facebook\.com$/i.test(hostname)) {
		return pathname.split('/').filter(Boolean)[0] ?? labels[0];
	}
	if (labels.length > 2 && HOSTING.test(labels.slice(-2).join('.'))) return labels[0];
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const years = [...html.matchAll(YEAR)].map((m) => ({ at: m.index, year: m[1] }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(new RegExp(ITEM, 'g'))) {
		const item = html.slice(m.index, m.index + 2000);
		const url = item.match(SITE)?.[1];
		// a few logos are not linked, and nothing else names them
		if (!url) continue;

		const raw = fromUrl(url);
		const host = key(raw);
		const words = decodeURIComponent(item.match(LOGO)?.[1] ?? '')
			.split(/[^A-Za-z0-9]+/)
			.filter((w) => w && !DRESSING.test(w));

		let name = capitalize(raw);
		outer: for (let len = words.length; len > 0; len--) {
			for (let start = 0; start + len <= words.length; start++) {
				const run = words.slice(start, start + len);
				const k = key(run.join(''));
				if (k.length > 1 && host.includes(k)) {
					name = capitalize(run.join(' '));
					break outer;
				}
			}
		}

		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: years.filter((y) => y.at < m.index).pop()?.year ?? '',
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('telluride: no companies on the portfolio page');
	}

	return companies;
}
