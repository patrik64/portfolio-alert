<script lang="ts">
	import { repo } from 'remult';
	import Spinner from '$lib/components/Spinner.svelte';
	import { Company } from '../../shared/Company';
	import { FUNDS } from '../../shared/funds';

	let companies = $state<Company[]>([]);
	let loading = $state(true);

	$effect(() => {
		repo(Company)
			// explicit limit — remult's REST API defaults to 100 rows per page
			.find({ orderBy: { name: 'asc' }, limit: 100_000 })
			.then((rows) => {
				companies = rows;
				loading = false;
			});
	});

	// local YYYY-MM-DD key so day boundaries follow the viewer's timezone
	const dayKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	const days = $derived.by(() => {
		const byDay = new Map<string, Company[]>();
		for (const c of companies) {
			if (!c.firstSeenAt) continue;
			const key = dayKey(c.firstSeenAt);
			const list = byDay.get(key);
			if (list) list.push(c);
			else byDay.set(key, [c]);
		}
		return [...byDay.entries()]
			.sort((a, b) => (a[0] < b[0] ? 1 : -1))
			.map(([day, rows]) => ({
				day,
				label: new Date(`${day}T00:00:00`).toLocaleDateString(),
				total: rows.length,
				funds: FUNDS.map((f) => ({
					...f,
					companies: rows.filter((c) => c.fundSlug === f.slug)
				})).filter((g) => g.companies.length > 0)
			}));
	});
</script>

<svelte:head>
	<title>history — portfolio alert</title>
</svelte:head>

<div
	class="mx-auto mt-2 w-full max-w-[52rem] p-4 lg:rounded-[5px] lg:border lg:border-dashed lg:border-gray-600"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">history</h1>
		{#if !loading}
			<span class="text-sm text-gray-600">
				{companies.length} companies over {days.length} {days.length === 1 ? 'day' : 'days'}
			</span>
		{/if}
	</div>

	{#if loading}
		<Spinner label="loading history" />
	{:else if days.length === 0}
		<p class="mt-6 text-sm text-gray-600">
			no companies yet — run a fetch from the <a href="/" class="font-semibold text-tertiary-600">dashboard</a>
		</p>
	{:else}
		{#each days as day (day.day)}
			<div class="mt-6">
				<h2 class="font-semibold text-gray-800">
					{day.label}
					<span class="ml-1 text-sm font-normal text-gray-500">
						({day.total} {day.total === 1 ? 'company' : 'companies'})
					</span>
				</h2>
				<div class="mt-3 flex flex-col gap-3">
					{#each day.funds as group (group.slug)}
						<details class="rounded-lg bg-white shadow-lg">
							<summary
								class="cursor-pointer px-4 py-3 font-semibold text-gray-800 transition duration-150 select-none hover:text-tertiary-600"
							>
								{group.name}
								<span class="ml-1 text-sm font-normal text-gray-500">({group.companies.length})</span>
							</summary>
							<ul class="divide-y divide-gray-200 border-t border-gray-200">
								{#each group.companies as company (company.id)}
									<li class="flex items-center justify-between gap-3 px-4 py-2">
										<div class="min-w-0">
											{#if company.url.startsWith('http')}
												<a
													href={company.url}
													target="_blank"
													rel="noopener noreferrer"
													class="font-medium text-gray-800 transition duration-150 hover:text-tertiary-600"
												>
													{company.name}
												</a>
											{:else}
												<span class="font-medium text-gray-800">{company.name}</span>
											{/if}
											{#if company.category}
												<span class="ml-2 text-xs text-gray-500">{company.category}</span>
											{/if}
										</div>
										<span class="shrink-0 text-xs text-gray-500">
											{company.firstSeenAt?.toLocaleTimeString()}
										</span>
									</li>
								{/each}
							</ul>
						</details>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>
