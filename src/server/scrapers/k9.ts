import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.k9ventures.com/startups/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the wall of logos backed by a modal per company that holds
// everything: the name as its heading, the city under it, the company's own
// address in the website link, the year the fund came in, and — for the ones
// it is out of — a bold line saying who acquired it. no sectors anywhere.

const MODAL = 'company-details';
const NAME = /<h1>([\s\S]*?)<\/h1>/;
const LOCATION = /<h5>([\s\S]*?)<\/h5>/;
const SITE = /class="website">\s*<a href="(https?:\/\/[^"]+)"/;
const YEAR = /K9 Investment<\/h3>\s*<p>[^<]*?(\d{4})/;
const NOTE = /<p class="bold">([\s\S]*?)<\/p>/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "San Francisco, CA" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const modal of html.split(MODAL).slice(1)) {
		const name = clean(modal.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const note = clean(modal.match(NOTE)?.[1] ?? '');
		companies.push({
			name,
			category: [
				tag(modal.match(LOCATION)?.[1] ?? ''),
				modal.match(YEAR)?.[1] ?? '',
				tag(note),
				/acquired|ipo/i.test(note) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: modal.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('k9: no companies on the startups page');
	}

	return companies;
}
