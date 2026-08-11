import type { RequestEvent } from '@sveltejs/kit';
import { repo } from 'remult';
import { api } from '../../server/api';
import { Company } from '../../shared/Company';
import { Fund } from '../../shared/Fund';
import { FUNDS } from '../../shared/funds';

// GET /download — all companies grouped by fund, served as a JSON attachment
export const GET = (event: RequestEvent) =>
	api.withRemult(event, async () => {
		const [companies, fundRows] = await Promise.all([
			repo(Company).find({ orderBy: { name: 'asc' }, limit: 100_000 }),
			repo(Fund).find({ limit: 100 })
		]);
		const bySlug = new Map(fundRows.map((f) => [f.slug, f]));

		const payload = {
			generatedAt: new Date().toISOString(),
			fundCount: FUNDS.length,
			companyCount: companies.length,
			funds: FUNDS.map((fund) => {
				const rows = companies.filter((c) => c.fundSlug === fund.slug);
				return {
					slug: fund.slug,
					name: fund.name,
					url: fund.url,
					lastFetchedAt: bySlug.get(fund.slug)?.lastFetchedAt ?? null,
					companyCount: rows.length,
					companies: rows.map((c) => ({
						name: c.name,
						category: c.category,
						url: c.url,
						firstSeenAt: c.firstSeenAt,
						isNewcomer: c.isNewcomer
					}))
				};
			})
		};

		return new Response(JSON.stringify(payload, null, 2), {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': 'attachment; filename="portfolio-alert-companies.json"'
			}
		});
	});
