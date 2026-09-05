import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.v1.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace one-pager: the companies are a logo gallery in the homepage's
// #companies section, each slide linking the company's own site. the gallery
// items carry no titles (?format=json on the gallery collection confirms it)
// and most logos were uploaded from the same "V1.VC Web Logo Template.jpg", so
// the hostname names the company — a logo filename is trusted only when it
// echoes the hostname ("rbc-signals.png" on rbcsignals.com), as for worklife.

const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
};

const capitalize = (s: string) => (/^[a-z]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const nameFor = (url: string, alt: string) => {
	const host = new URL(url).hostname.toLowerCase();
	const candidate = decodeURIComponent(alt)
		.replace(/\.\w+$/, '')
		.replace(/[-_+]/g, ' ')
		.trim();
	const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (key.length > 1 && host.includes(key)) {
		return candidate.split(' ').filter(Boolean).map(capitalize).join(' ');
	}
	return capitalize(hostLabel(url));
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const at = html.indexOf('id="companies"');
	if (at < 0) {
		throw new Error('v1vc: no companies section on the homepage');
	}
	const section = html.slice(at, html.indexOf('</section>', at));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const slide of section.split('class="slide"').slice(1)) {
		const href = slide.match(/href="(https?:\/\/[^"]+)"/)?.[1];
		if (!href) continue;
		// URL normalizes the site's occasional capitalized hostnames
		const url = new URL(href).href;
		if (seen.has(url)) continue;
		seen.add(url);
		companies.push({ name: nameFor(url, slide.match(/alt="([^"]*)"/)?.[1] ?? ''), category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('v1vc: no companies in the homepage companies section');
	}

	return companies;
}
