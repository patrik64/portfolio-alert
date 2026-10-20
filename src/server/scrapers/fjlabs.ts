import { request } from 'node:https';
import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fjlabs.com/portfolio';
const MAX_PAGES = 60;
// the pages are asked for one at a time, a pause between them
const PACE_MS = 250;
// the pauses before a refused page is asked for again
const RETRY_MS = [2_000, 8_000];
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// cloudflare in front of the site turns the nightly run away with a 403 now
// and then: on its first night, and on 2026-10-20 at the third page after two
// had come through, when asking once more under the app's own name did not
// help. balderton's cloudflare refused fetch whatever name it gave and let
// the app's own name through node's https module, so a refused page is now
// asked for again that way, after a pause, and once more after a longer one
const OWN_UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// webflow: the portfolio is a collection a hundred to a page, walked through
// webflow's own "next" links. every row names the company and carries, as
// fields for finsweet's filters, whether it is exited, the stage and year the
// fund came in, its country, region and industry, and whether it is a
// marketplace. the name links nowhere ("#"), so a company comes without a
// site unless the row gives one.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bcollection-item\b)/;
const NAME = /fs-cmsfilter-field="Name"[^>]*>([\s\S]*?)<\/a>/;
const HREF = /fs-cmsfilter-field="Name"[^>]*\bhref="([^"]*)"|<a\b[^>]*\bhref="([^"]*)"[^>]*fs-cmsfilter-field="Name"/;
const field = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`);
const EXITED = field('Exited');
const STAGE = field('Entry Stage');
const YEAR = field('Entry Year');
const GEOGRAPHY = field('Geography');
const INDUSTRY = field('Industry');
const MARKETPLACE = field('Marketplace');
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;
const STEALTH = /^stealth\b/i;

interface Answer {
	status: number;
	body: string;
}

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

// the page through node's https module, under the app's own name
function getHonestly(url: string): Promise<Answer> {
	return new Promise((resolve, reject) => {
		const req = request(url, { headers: { 'User-Agent': OWN_UA } }, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () =>
				resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
			);
			res.on('error', reject);
		});
		req.setTimeout(30_000, () => req.destroy(new Error(`fjlabs: ${url} did not answer in 30 s`)));
		req.on('error', reject);
		req.end();
	});
}

async function fetchPage(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (resp.ok) return resp.text();
	await resp.body?.cancel();
	let status = resp.status;
	for (const ms of RETRY_MS) {
		if (status !== 403) break;
		await wait(ms);
		const answer = await getHonestly(url);
		if (answer.status === 200) return answer.body;
		status = answer.status;
	}
	throw new Error(`Failed to fetch ${url}: ${status}`);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let url = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && url; page++) {
		if (page > 0) await wait(PACE_MS);
		const html = await fetchPage(url);

		for (const item of html.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const href = unescape(item.match(HREF)?.slice(1).find(Boolean) ?? '');
			const year = clean(item.match(YEAR)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
			companies.push({
				name,
				category: [
					tag(item.match(INDUSTRY)?.[1] ?? ''),
					/^yes$/i.test(clean(item.match(MARKETPLACE)?.[1] ?? '')) ? 'Marketplace' : '',
					tag(item.match(STAGE)?.[1] ?? ''),
					year ? `Invested ${year}` : '',
					tag(item.match(GEOGRAPHY)?.[1] ?? ''),
					/^true$/i.test(clean(item.match(EXITED)?.[1] ?? '')) ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//.test(href) ? href : ''
			});
		}

		const next = html.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${unescape(next)}` : '';
	}

	if (companies.length === 0) {
		throw new Error('fjlabs: no companies in the portfolio list');
	}

	return companies;
}
