<script lang="ts">
	import { dev } from '$app/environment';
	import { repo } from 'remult';
	import Spinner from '$lib/components/Spinner.svelte';
	import { Company } from '../../shared/Company';
	import { FUNDS } from '../../shared/funds';
	import { ScrapeController } from '../../shared/ScrapeController';

	let newcomers = $state<Company[]>([]);
	let loading = $state(true);
	let cleaning = $state(false);

	async function clean() {
		if (cleaning) return;
		cleaning = true;
		try {
			await ScrapeController.clearNewcomers();
			newcomers = [];
		} finally {
			cleaning = false;
		}
	}

	$effect(() => {
		repo(Company)
			// explicit limit — remult's REST API defaults to 100 rows per page
			.find({ where: { isNewcomer: true }, orderBy: { name: 'asc' }, limit: 100_000 })
			.then((rows) => {
				newcomers = rows;
				loading = false;
			});
	});

	const groups = $derived(
		FUNDS.map((f) => ({ ...f, companies: newcomers.filter((c) => c.fundSlug === f.slug) })).filter(
			(g) => g.companies.length > 0
		)
	);
</script>

<svelte:head>
	<title>newcomers — portfolio-alert</title>
</svelte:head>

<div
	class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">newcomers</h1>
		{#if !loading}
			<div class="flex items-center gap-3">
				<span class="text-sm text-gray-900">
					{newcomers.length} new {newcomers.length === 1 ? 'company' : 'companies'}
				</span>
				{#if dev && newcomers.length > 0}
					<button
						type="button"
						onclick={clean}
						disabled={cleaning}
						class="rounded-md border border-transparent bg-primary-600 px-4 py-1 text-sm leading-5 font-semibold text-white shadow-sm transition duration-150 ease-in-out hover:bg-primary-400 focus:shadow-outline-green focus:outline-none disabled:cursor-default disabled:bg-gray-300"
					>
						{cleaning ? 'cleaning…' : 'clean'}
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if loading}
		<Spinner label="loading newcomers" />
	{:else if groups.length === 0}
		<p class="mt-6 text-sm text-gray-900">
			no newcomers — run a fetch from the <a href="/funds" class="font-semibold text-black transition duration-150 hover:text-white">dashboard</a>
		</p>
	{:else}
		<div class="mt-4 flex flex-col gap-4">
			{#each groups as group (group.slug)}
				<!-- every block starts open; the fund's name opens its page, the rest of the
				     header closes and opens the block -->
				<details open class="group overflow-hidden rounded-lg bg-white shadow-lg">
					<summary
						class="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-gray-800 transition duration-150 select-none hover:bg-gray-200 [&::-webkit-details-marker]:hidden"
					>
						<a href={`/funds/${group.slug}`} class="text-lg text-dark-500 hover:underline">{group.name}</a>
						<span class="text-sm font-normal text-gray-900">({group.companies.length})</span>
						<svg
							class="ml-auto h-5 w-5 shrink-0 text-gray-500 transition-transform duration-150 group-open:rotate-180"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fill-rule="evenodd"
								d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
								clip-rule="evenodd"
							/>
						</svg>
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
								<span class="shrink-0 text-xs text-gray-900">
									first seen {company.firstSeenAt?.toLocaleDateString()}
								</span>
							</li>
						{/each}
					</ul>
				</details>
			{/each}
		</div>
	{/if}
</div>
