import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.mercuri.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, and the portfolio is a wall of image blocks under headings the
// fund writes twice — two runs of current investments and two of exits, which
// is why the heading nearest above a logo is what says which a company is
// rather than the order they come in.
//
// what a logo carries is a long alt: the company, an em dash, a line about it,
// and the fund's own name after a pipe. the name is what comes before the
// dash.
//
// one of those alts was pasted out of a chat window and still says so: it
// opens "16:14 … Claude responded: Papercup — AI-powered video dubbing…" and
// then repeats itself. so anything up to the last colon is dropped and the
// characters a terminal leaves behind are taken out, which leaves Papercup and
// changes nothing for the other sixty-three.
//
// one logo is described rather than named — "Text saying 'the know' inside a
// purple circle" — and has no dash to cut at, so the file it was uploaded
// under names it instead: The Know.
//
// a link is only a company's when it sits between its logo and the one before
// it. reading backwards any further would hand a company that has no link the
// address of the one above it, and thirteen of them have none — their sites
// went when they did.

const LOGO = /<img[^>]*?\bdata-sqsp-image-block-image\b[^>]*?\balt="([^"]*)"/g;
const HEADING = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/g;
const LINK = /<a\b[^>]*?\bclass="sqs-block-image-link[^"]*"[^>]*?\bhref="([^"]*)"/g;
const FILE = /data-src="([^"]*)"/;
// what the fund says of a company it no longer holds
const GONE = /exit/i;
// the fund's own logo, which stands at the foot of the page
const NOT_A_COMPANY = /^mercuri\b/i;
// what a chat window leaves in text pasted out of it
const PASTED = /[-]/g;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the file a logo was uploaded under, read as a name
const fromFile = (src: string) => {
	try {
		return clean(
			decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
				.replace(/\+/g, ' ')
				.replace(/\.[a-z0-9]+$/i, '')
				.replace(/\s*logos?\s*$/i, '')
		);
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const headings = [...html.matchAll(HEADING)]
		.map((heading) => ({ at: heading.index, said: clean(heading[1]) }))
		.filter((heading) => heading.said);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let previous = 0;
	for (const logo of html.matchAll(LOGO)) {
		const at = logo.index;
		const since = html.slice(previous, at);
		previous = at;

		const alt = clean(logo[1]).replace(PASTED, '');
		// the fund writes "Company — what it does | Mercuri VC portfolio"
		const said = alt.split('|')[0];
		const name = clean(
			(/[—–]/.test(said) ? said.split(/[—–]/)[0] : fromFile(html.slice(at - 200, at + 400).match(FILE)?.[1] ?? ''))
				// what is left of a paste out of a chat window
				.replace(/^.*?:\s+/, '')
		);
		if (!name || NOT_A_COMPANY.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const heading = headings.filter((one) => one.at < at).at(-1)?.said ?? '';
		const link = [...since.matchAll(LINK)].at(-1)?.[1] ?? '';

		companies.push({
			name,
			category: GONE.test(heading) ? 'Exits' : '',
			url: /^https?:\/\//i.test(link) ? link : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('mercuri: no companies on the portfolio wall');
	}

	return companies;
}
