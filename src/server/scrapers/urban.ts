import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.urban.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the page is three summary blocks over three blog collections
// (/investmentsarchive, /portfolio-130, /portfolio-57). each collection holds
// exactly as many posts as its block renders — 30, 30 and 4, checked against
// ?format=json — so the served page is the whole portfolio, no paging needed.
//
// the name comes from the summary title link, not the sibling data-title
// attribute: the attribute is double-escaped there ("Stop, Breathe &amp;amp;
// Think"), and the app decodes entities exactly once.
//
// the fund publishes no sectors, only a one-line description, and an
// acquisition is named nowhere but that line ("(acquired by Ford)") — so a
// company that has not exited comes back with no category at all. a few of the
// acquired ones point at the acquirer or at the press story instead of the
// company's own site; that link is still what the fund published.

const TITLE =
	/<div class="summary-title">\s*<a\b([\s\S]*?)class="summary-title-link">([\s\S]*?)<\/a>/g;
const EXCERPT = /class="\s*summary-excerpt[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/;

// squarespace stores whatever the editor typed into the link field, so a
// scheme-less "example.com" is possible; take it the way the address bar would
const siteUrl = (href: string) =>
	/^https?:\/\//i.test(href) ? href : /^[\w-]+(\.[\w-]+)+/.test(href) ? `https://${href}` : '';

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const titles = [...html.matchAll(TITLE)];
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, m] of titles.entries()) {
		const name = m[2].replace(/\s+/g, ' ').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		// the card's own excerpt is the first one after its title link
		const rest = html.slice(m.index + m[0].length, titles[i + 1]?.index ?? html.length);
		const excerpt = (rest.match(EXCERPT)?.[1] ?? '').replace(/<[^>]+>/g, '');

		companies.push({
			name,
			category: /\bacquired\b/i.test(excerpt) ? 'Acquired' : '',
			url: siteUrl((m[1].match(/href="([^"]*)"/)?.[1] ?? '').trim())
		});
	}

	if (companies.length === 0) {
		throw new Error('urban: no companies on the portfolio page');
	}

	return companies;
}
