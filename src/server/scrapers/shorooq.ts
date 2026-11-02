import { request } from 'node:https';
import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.shorooq.com/portfolio';
// cloudflare in front of the site answers the deployment's fetch with a 403 and a
// laptop's with the page, under the same browser's name, as it did twice on the
// night of 2026-11-02. balderton's cloudflare refused fetch whatever name it gave and
// let the app's own name through node's https module, so that is how it is asked
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// astro: the rows show a name, a sector and a country, and open a popup filled from
// the json the page carries for it, so the whole list is in one script tag, with
// each company's site and, on those the fund is out of, how it ended: "Acquired",
// "Exited" or "Liquidated".
const DATA = /<script id="pf-data" type="application\/json">([\s\S]*?)<\/script>/;
const BLOCKED = /Sorry, you have been blocked|Attention Required! \| Cloudflare/;

interface Company {
	name?: string;
	website?: string;
	industry?: string;
	location?: string;
	status?: string;
}

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string | undefined) => (s ?? '').trim().replace(/\s*,\s*/g, ' / ');

function read(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = request(url, { headers: { 'User-Agent': UA } }, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('error', reject);
			res.on('end', () => {
				const body = Buffer.concat(chunks).toString('utf8');
				if (res.statusCode === 200) return resolve(body);
				// the dashboard should say what it is rather than show a bare status
				const refusal = res.headers['cf-mitigated']
					? ", cloudflare's challenge"
					: BLOCKED.test(body)
						? ", cloudflare's block page"
						: '';
				reject(new Error(`Failed to fetch ${url}: ${res.statusCode}${refusal}`));
			});
		});
		req.setTimeout(30_000, () => req.destroy(new Error(`shorooq: ${url} did not answer in 30 s`)));
		req.on('error', reject);
		req.end();
	});
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const data = (await read(PAGE_URL)).match(DATA)?.[1];
	if (!data) {
		throw new Error('shorooq: no company data in the page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { name: shown, website, industry, location, status } of JSON.parse(data) as Company[]) {
		const name = shown?.trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const ended = tag(status);
		companies.push({
			name,
			category: [tag(industry), tag(location), ended === 'Exited' ? '' : ended, ended ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: website ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('shorooq: no companies in the page data');
	}

	return companies;
}
