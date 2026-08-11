// Standalone smoke test for the ported scrapers, outside the SvelteKit app:
//   pnpm test-scrapers            run all 35
//   pnpm test-scrapers slug ...   run selected ones
import { scraperBySlug, scrapers } from '../src/server/scrapers/index';

const args = process.argv.slice(2);
const targets = args.length
	? args.map((slug) => {
			const s = scraperBySlug.get(slug);
			if (!s) {
				console.error(`unknown scraper: ${slug}`);
				process.exit(1);
			}
			return s;
		})
	: scrapers;

let failed = 0;
for (const s of targets) {
	const t0 = Date.now();
	try {
		const companies = await s.scrape();
		console.log(
			`OK   ${s.slug.padEnd(16)} ${String(companies.length).padStart(5)} companies in ${((Date.now() - t0) / 1000).toFixed(1)}s`
		);
		console.log(`     sample: ${companies.slice(0, 3).map((c) => c.name).join(' | ')}`);
	} catch (err) {
		failed++;
		console.log(`FAIL ${s.slug.padEnd(16)} ${err instanceof Error ? err.message : err}`);
	}
}
console.log(`\n${targets.length - failed}/${targets.length} scrapers OK`);
process.exit(failed ? 1 : 0);
