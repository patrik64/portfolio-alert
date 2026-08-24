<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import Footer from '$lib/components/Footer.svelte';
	import '../app.css';

	let { children } = $props();
	let menuOpen = $state(false);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="alternate" type="application/rss+xml" title="portfolio alert" href="/rss.xml" />
	<title>portfolio alert</title>
</svelte:head>

<svelte:window
	onclick={() => (menuOpen = false)}
	onkeydown={(e) => e.key === 'Escape' && (menuOpen = false)}
/>

<div class="flex min-h-screen flex-col">
	<div class="flex items-center p-2 select-none">
		<div class="relative">
			<button
				type="button"
				aria-label="menu"
				onclick={(e) => {
					e.stopPropagation();
					menuOpen = !menuOpen;
				}}
				class="flex h-8 w-8 items-center justify-center rounded-full border border-frame transition duration-150 ease-in-out hover:bg-white focus:outline-none"
			>
				<svg width="20" height="20" viewBox="0 0 20 20" fill="black">
					<path
						fill-rule="evenodd"
						d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
			{#if menuOpen}
				<div class="absolute left-0 z-10 mt-1 w-40 rounded-md bg-white py-1 shadow-lg shadow-xs">
					<a
						href="/"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						funds
					</a>
					<a
						href="/search"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						search
					</a>
					<a
						href="/newcomers"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						newcomers
					</a>
					<a
						href="/timeline"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						timeline
					</a>
					<a
						href="/download"
						download
						data-sveltekit-reload
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						download
					</a>
					<a
						href="https://bsky.app/profile/portfolio-alert.bsky.social"
						target="_blank"
						rel="external noreferrer"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						bluesky
					</a>
					<a
						href="/rss.xml"
						target="_blank"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						rss
					</a>
					<a
						href="https://github.com/patrik64/portfolio-alert"
						target="_blank"
						rel="external noreferrer"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						github
					</a>
					<a
						href="/about"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						about
					</a>
				</div>
			{/if}
		</div>
		<a href="/" class="-mt-1 pl-2 font-semibold text-black">portfolio alert</a>
		<!-- each link drops out at the width where it stops fitting, rightmost first,
		     so the icons on the right always keep their place; the menu holds them all -->
		<nav class="-mt-1 flex items-center gap-3 pl-4 text-sm">
			<a
				href="/search"
				class="hidden min-[315px]:block text-black transition duration-150 hover:text-white"
			>
				search
			</a>
			<a
				href="/newcomers"
				class="hidden min-[405px]:block text-black transition duration-150 hover:text-white"
			>
				newcomers
			</a>
			<a
				href="/timeline"
				class="hidden min-[465px]:block text-black transition duration-150 hover:text-white"
			>
				timeline
			</a>
			<a
				href="/about"
				class="hidden min-[515px]:block text-black transition duration-150 hover:text-white"
			>
				about
			</a>
		</nav>
		<div class="-mt-1 ml-auto flex items-center gap-3 pr-1 text-black">
			<a
				href="/download"
				download
				data-sveltekit-reload
				aria-label="download"
				title="download"
				class="transition duration-150 hover:text-white"
			>
				<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
					<path
						fill-rule="evenodd"
						d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
			</a>
			<a
				href="/rss.xml"
				target="_blank"
				aria-label="rss"
				title="rss"
				class="transition duration-150 hover:text-white"
			>
				<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
					<path d="M5 3a1 1 0 000 2c5.523 0 10 4.477 10 10a1 1 0 102 0C17 8.373 11.627 3 5 3z" />
					<path
						d="M4 9a1 1 0 011-1 7 7 0 017 7 1 1 0 11-2 0 5 5 0 00-5-5 1 1 0 01-1-1zM3 15a2 2 0 114 0 2 2 0 01-4 0z"
					/>
				</svg>
			</a>
			<a
				href="https://bsky.app/profile/portfolio-alert.bsky.social"
				target="_blank"
				rel="external noreferrer"
				aria-label="bluesky"
				title="bluesky"
				class="transition duration-150 hover:text-white"
			>
				<svg width="20" height="18" viewBox="0 0 568 501" fill="currentColor">
					<path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.89-129.52 80.986-149.071-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.66 0 75.293 0 57.947 0-28.906 76.135-1.611 123.121 33.664Z" />
				</svg>
			</a>
		</div>
	</div>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer>
		<Footer />
	</footer>
</div>
