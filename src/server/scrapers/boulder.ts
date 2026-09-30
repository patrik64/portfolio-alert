import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.boulderventures.com';
const PAGE_URL = `${BASE_URL}/whatwevedone`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the "what we've done" page is a gallery of logos, each
// captioned "24/7 Media - Realized, IT Services" — the company, whether the
// fund is still in it ("Active") or out ("Realized"), and its sector — and
// each linking the company's page on the fund's site. that page holds the
// company's own site ("Website:") and, for a realized one, how it went
// ("Outcome:"): a listing, a sale, a merger, one after another where there
// were several ("IPO (NASDAQ:ARRY) November, 2000; Acquired by Pfizer July,
// 2019"). the pages are fetched one at a time, and one that will not load
// leaves its company linking to it, named and filed as the caption says.

const SLIDE = /(?=<div class="slide" data-type="image")/;
const HREF = /<a\b[^>]*?\bhref="([^"]*)"/;
const TITLE = /class="image-slide-title"[^>]*>([\s\S]*?)<\/div>/;
const CAPTION = /^(.*?)\s+-\s+(active|realized)\b\s*,?\s*(.*)$/i;
// the site is written as text, or as a link on some pages, after a space
// that may be a hard one
const SITE =
	/<strong>\s*Website:?\s*<\/strong>(?:\s|&nbsp;)*(?:<a\b[^>]*\bhref="([^"]*)"[^>]*>)?(?:\s|&nbsp;)*([^<]*)/i;
const OUTCOME = /<strong>\s*Outcome:?\s*<\/strong>\s*([^<]*)/i;
// "November, 1999", "October 2020", ", July 2022", "in March, 2003", on the end of a clause
const DATE = /,?\s*(?:\bin\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(?:19|20)\d{2}\s*\.?\s*$/i;
const LEGAL = /,\s*(?:inc|llc|ltd|corp)\.?(?=\s|$)/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// what an outcome says, a clause at a time, the dates left off: "IPO
// (NASDAQ:XACT) November, 1999" -> "IPO (NASDAQ:XACT)", "Sold to Venaxis
// (NASDAQ:APPY) September, 2016" -> "Acquired by Venaxis (NASDAQ:APPY)",
// "raised $69MM in a public offering (NASDAQ:CCOI) June, 2005" -> "IPO
// (NASDAQ:CCOI)"
function outcomes(said: string): string[] {
	return said
		.split(/\s*;\s*/)
		.map((clause) => clean(clause).replace(DATE, '').replace(LEGAL, '').replace(/[.,]\s*$/, '').trim())
		.filter(Boolean)
		.map((clause) => {
			const sold = clause.match(/^(?:sold|sale) to\s+(.+)$/i);
			if (sold) return `Acquired by ${tag(sold[1])}`;
			const merged = clause.match(/^merge[dr]?\s+(?:with|into)\s+(.+)$/i);
			if (merged) return `Merged with ${tag(merged[1])}`;
			const offered = clause.match(/\bpublic offering\b.*?\(([^)]*)\)/i);
			if (offered) return `IPO (${tag(offered[1])})`;
			return tag(clause).replace(/^acquired by\b/i, 'Acquired by').replace(/^ipo\b/i, 'IPO');
		});
}

// the company's page on the fund's site, or nothing when it will not load;
// a refusal is waited out once
async function pageOf(url: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(url, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			return resp.ok ? await resp.text() : '';
		} catch {
			return '';
		}
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
	for (const chunk of html.split(SLIDE).slice(1)) {
		// the last slide runs on to the end of the page, so each is cut after its caption
		const at = chunk.search(TITLE);
		const end = at < 0 ? -1 : chunk.indexOf('</div>', at);
		const slide = end < 0 ? chunk : chunk.slice(0, end + '</div>'.length);
		const caption = clean(slide.match(TITLE)?.[1] ?? '').match(CAPTION);
		const name = caption?.[1] ?? '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const realized = /^realized$/i.test(caption?.[2] ?? '');
		const path = unescape(slide.match(HREF)?.[1] ?? '').trim();
		const page = path.startsWith('/') ? `${BASE_URL}${path}` : '';
		if (page) await wait(PACE_MS);
		const detail = page ? await pageOf(page) : '';
		const [, linked, written] = detail.match(SITE) ?? [];
		const site = unescape(linked ?? '').trim() || clean(written ?? '');
		companies.push({
			name,
			category: [tag(caption?.[3] ?? ''), ...outcomes(detail.match(OUTCOME)?.[1] ?? ''), realized ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : page || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('boulder: no companies in the gallery');
	}

	return companies;
}
