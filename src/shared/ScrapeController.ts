import { BackendMethod, repo } from 'remult';
import type { ScrapedCompany } from '../server/scrapers/types';
import { Company } from './Company';
import { Fund } from './Fund';

export interface FetchResult {
	slug: string;
	total: number;
	added: number;
	// the first fetch of a fund imports a baseline: nothing is marked as new
	baseline: boolean;
}

// company identity within a fund — urls and categories are too unreliable to key on
const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const inFlight = new Set<string>();

export class ScrapeController {
	@BackendMethod({ allowed: true })
	static async fetchFund(slug: string): Promise<FetchResult> {
		// This class is client-bundled (it's how @BackendMethod builds its HTTP
		// proxy), but the method body only ever runs on the server. The statically
		// dead !SSR branch lets Vite drop the scrapers from the client build.
		if (!import.meta.env.SSR) throw new Error('fetchFund only runs on the server');
		const { scraperBySlug } = await import('../server/scrapers/index');
		const entry = scraperBySlug.get(slug);
		if (!entry) throw new Error(`unknown fund: ${slug}`);
		if (inFlight.has(slug)) throw new Error(`${entry.name}: fetch already running`);
		inFlight.add(slug);
		try {
			const scraped = await Promise.race([
				entry.scrape(),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error(`${entry.name}: scrape timed out after 4 minutes`)),
						240_000
					)
				)
			]);

			const byKey = new Map<string, ScrapedCompany>();
			for (const c of scraped) {
				const key = nameKey(c.name ?? '');
				if (key && !byKey.has(key)) byKey.set(key, c);
			}

			const companies = repo(Company);
			const existing = await companies.find({ where: { fundSlug: slug }, limit: 100_000 });
			const existingKeys = new Set(existing.map((c) => nameKey(c.name)));
			const newcomers = [...byKey].filter(([key]) => !existingKeys.has(key));
			const baseline = existing.length === 0;

			// the previous batch is no longer "new" — cleared only now that the
			// scrape succeeded, so a failed fetch keeps the last newcomer set intact
			await companies.updateMany({
				where: { fundSlug: slug, isNewcomer: true },
				set: { isNewcomer: false }
			});

			// chunked concurrent inserts; the pg pool bounds real concurrency
			for (let i = 0; i < newcomers.length; i += 50) {
				await Promise.all(
					newcomers.slice(i, i + 50).map(([key, c]) =>
						companies.insert({
							id: `${slug}:${key}`,
							fundSlug: slug,
							name: c.name.trim(),
							category: c.category ?? '',
							url: c.url ?? '',
							isNewcomer: !baseline
						})
					)
				);
			}

			const added = baseline ? 0 : newcomers.length;
			await repo(Fund).upsert({
				where: { slug },
				set: {
					name: entry.name,
					companyCount: existing.length + newcomers.length,
					newCount: added,
					lastFetchedAt: new Date(),
					lastError: ''
				}
			});
			return { slug, total: existing.length + newcomers.length, added, baseline };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await repo(Fund)
				.upsert({ where: { slug }, set: { lastError: message } })
				.catch(() => {});
			throw err;
		} finally {
			inFlight.delete(slug);
		}
	}

	// "clean" on the newcomers page: acknowledge the current newcomers so the
	// list starts empty until the next fetch finds something new
	@BackendMethod({ allowed: true })
	static async clearNewcomers(): Promise<number> {
		const cleared = await repo(Company).updateMany({
			where: { isNewcomer: true },
			set: { isNewcomer: false }
		});
		await repo(Fund).updateMany({ where: { newCount: { $gt: 0 } }, set: { newCount: 0 } });
		return cleared;
	}
}
