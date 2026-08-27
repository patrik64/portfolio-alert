<script lang="ts">
	import { page } from '$app/state';
	import { repo } from 'remult';
	import Spinner from '$lib/components/Spinner.svelte';
	import { Company } from '../../../shared/Company';
	import { fundBySlug } from '../../../shared/funds';

	const slug = $derived(page.params.slug ?? '');
	const fund = $derived(fundBySlug.get(slug));
	const name = $derived(fund?.name ?? slug);

	let companies = $state<Company[]>([]);
	let loading = $state(true);
	let search = $state('');

	$effect(() => {
		const current = slug;
		loading = true;
		repo(Company)
			// explicit limit — remult's REST API defaults to 100 rows per page
			.find({ where: { fundSlug: current }, orderBy: { name: 'asc' }, limit: 100_000 })
			.then((rows) => {
				if (current === slug) {
					companies = rows;
					loading = false;
				}
			});
	});

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return companies;
		return companies.filter(
			(c) => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
		);
	});
</script>

<svelte:head>
	<title>{name} — portfolio alert</title>
</svelte:head>

<div
	class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold text-white">
			{#if fund}
				<a
					href={fund.url}
					target="_blank"
					rel="noopener noreferrer"
					class="transition duration-150 hover:text-gray-400"
				>
					{name}
				</a>
			{:else}
				{name}
			{/if}
		</h1>
		{#if !loading}
			<span class="text-sm text-white">
				{filtered.length} of {companies.length} companies
			</span>
		{/if}
	</div>

	<input
		type="text"
		placeholder="search name or category…"
		bind:value={search}
		class="form-input mt-3 w-full focus:shadow-outline-gray"
	/>

	{#if loading}
		<Spinner label="loading companies" />
	{:else if companies.length === 0}
		<p class="mt-6 text-sm text-white">
			no companies yet — run a fetch from the <a href="/" class="font-semibold text-white transition duration-150 hover:text-gray-400">dashboard</a>
		</p>
	{:else}
		<ul class="mt-4 divide-y divide-gray-200 rounded-lg bg-white shadow-lg">
			{#each filtered as company (company.id)}
				<li class="flex items-center justify-between gap-3 px-4 py-2">
					<div class="min-w-0">
						{#if company.url.startsWith('http')}
							<a
								href={company.url}
								target="_blank"
								rel="noopener noreferrer"
								class="font-medium text-gray-800 transition duration-150 hover:underline"
							>
								{company.name}
							</a>
						{:else}
							<span class="font-medium text-gray-800">{company.name}</span>
						{/if}
						{#if company.category}
							<span class="ml-2 text-xs text-gray-900">{company.category}</span>
						{/if}
					</div>
					<div class="flex shrink-0 items-center gap-3">
						{#if company.isNewcomer}
							<span class="rounded-full bg-warning-500 px-2 py-0.5 text-xs font-semibold text-white">
								new
							</span>
						{/if}
						<span class="text-xs text-gray-900">
							first seen {company.firstSeenAt?.toLocaleDateString()}
						</span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
