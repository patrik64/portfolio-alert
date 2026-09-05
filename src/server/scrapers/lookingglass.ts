import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://lookingglass.vc/investments';
const AJAX_URL = 'https://lookingglass.vc/wp-admin/admin-ajax.php';
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, drawing the portfolio as a wall of logos whose tiles carry only
// a post id — most without even the name in the picture's alt. clicking a
// tile asks admin-ajax for a popup, and that popup is where everything
// lives: the name, the company's own address, a one-line description and
// which of the fund's funds came in. so the wall is read for the ids and the
// popups for the companies. the fund's own fund is a vehicle rather than
// anything about the company, and the one-liner is a description rather than
// a sector, so the category stays empty.
//
// the origin dozes between visits — the first response can take twenty
// seconds — which the batches below simply wait out.
//
// one tile is a post called "untitled" over a stock placeholder image, the
// fund's slot for a company it does not name. that is not a name to file it
// under, so it is left out until the fund says who it is.

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

async function quickview(id: string): Promise<{ name: string; url: string }> {
	const resp = await fetch(AJAX_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
		body: `action=wpb_fp_quickview&portfolio=${id}`
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch quickview ${id}: ${resp.status}`);
	}
	const html = await resp.text();
	return {
		name: clean(html.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
		url: html.match(/class="coLink" href="(https?:\/\/[^"]+)"/)?.[1] ?? ''
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const ids = [...new Set([...html.matchAll(/data-post-id="(\d+)"/g)].map((m) => m[1]))];
	if (ids.length === 0) {
		throw new Error('lookingglass: no portfolio tiles on the investments page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < ids.length; i += BATCH_SIZE) {
		const batch = await Promise.all(ids.slice(i, i + BATCH_SIZE).map(quickview));
		for (const { name, url } of batch) {
			if (!name || /^untitled$/i.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			companies.push({ name, category: '', url });
		}
	}

	if (companies.length === 0) {
		throw new Error('lookingglass: no companies in the portfolio popups');
	}

	return companies;
}
