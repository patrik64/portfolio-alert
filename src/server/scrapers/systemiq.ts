import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.systemiqcapital.earth/portfolio-overview';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, three galleries one after another, each headed by a text block
// naming the theme it collects: electrification, decoding nature, applied ai.
// the galleries carry no heading of their own, so a company's theme is the
// last short text block standing above it.
//
// each tile links to the company and captions it "name | what it does". the
// caption is where an exit is recorded, as "(Exited)" after the name — that
// suffix is moved into the category, because a company that exits keeps its
// name and must not read as a new one.

const ITEM = '<figure class="gallery-grid-item';
const TEXT_BLOCK = /<div class="sqs-html-content" data-sqsp-text-block-content>([\s\S]*?)<\/div>/g;
const NAME = /class="gallery-caption-content"><strong>([\s\S]*?)<\/strong>/;
const SITE = /href="(https?:\/\/[^"]+)"/;
const EXITED = /\s*\(Exited\)\s*$/i;
// the themes are a couple of words; the page's prose blocks are sentences
const LABEL_MAX = 60;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const labels = [...html.matchAll(TEXT_BLOCK)]
		.map((m) => ({ at: m.index, text: clean(m[1]) }))
		.filter((b) => b.text && b.text.length <= LABEL_MAX);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(new RegExp(ITEM, 'g'))) {
		const item = html.slice(m.index, m.index + 3000);
		const captioned = clean(item.match(NAME)?.[1] ?? '');
		const name = captioned.replace(EXITED, '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [
				labels.filter((b) => b.at < m.index).pop()?.text ?? '',
				EXITED.test(captioned) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('systemiq: no companies on the portfolio page');
	}

	return companies;
}
