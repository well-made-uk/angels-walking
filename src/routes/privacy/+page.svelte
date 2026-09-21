<script lang="ts">
	import { SITE } from '$lib/site';
</script>

<svelte:head>
	<title>Privacy · {SITE.name}</title>
</svelte:head>

<main>
	<p class="crumb"><a href="/">← Back to the walks</a></p>
	<h1>Privacy</h1>

	<p class="lede">
		{SITE.name} is an independent, informal walking group. It is <strong>not run by, affiliated
		with or endorsed by any charity or organisation</strong>, and no organisation is responsible for
		this site or the information on it.
	</p>

	<h2>What we keep</h2>
	<ul>
		<li><strong>Your name and email address</strong>, which you give us when you sign up.</li>
		<li>
			<strong>What you do on the site:</strong> the walks you sign up for, the days you vote for, the
			walk ideas you suggest or heart, and when you last used the site.
		</li>
	</ul>
	<p>We don’t use tracking, advertising or analytics, and we don’t use Google services. Maps open in OpenStreetMap.</p>

	<h2>Why</h2>
	<p>
		To organise walks: so the organiser knows who’s coming, can pick the day most people can make, and
		can get in touch if plans change (for example if a walk is cancelled).
	</p>

	<h2>Who can see it</h2>
	<p>
		Walk details (dates, meeting points and routes) are only shown to walkers who have logged in
		with the passphrase shared within the group. The site asks search engines not to list it.
	</p>
	<ul>
		<li>
			<strong>Your name</strong> is shown to other logged-in walkers (on walks you’ve joined and ideas
			you’ve suggested). People who aren’t logged in can’t see anything.
		</li>
		<li><strong>Your email address</strong> is only seen by the walk organisers. It’s never shown to other walkers.</li>
	</ul>
	<p>We never sell your details or share them with anyone else.</p>

	<h2>Where it’s stored</h2>
	<p>
		In a database hosted by Supabase, in their London data centre. Your browser also remembers who you
		are, so you stay logged in on that device until you press “Log out”.
	</p>

	<h2>How long we keep it</h2>
	<p>
		Until you ask us to remove it. When we delete your details, your sign-ups, votes and suggestions
		are deleted with them.
	</p>

	<h2>Your choices</h2>
	<p>
		You can ask to see the information we hold about you, have it corrected, or have it deleted at
		any time.
		{#if SITE.contactEmail}
			Email <a href="mailto:{SITE.contactEmail}">{SITE.contactEmail}</a>.
		{:else}
			Just ask the walk organiser.
		{/if}
	</p>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
	}

	.crumb {
		margin: 0 0 1rem;
	}

	h1 {
		margin-bottom: 1rem;
	}

	h2 {
		font-size: 1.15rem;
		margin: 1.75rem 0 0.5rem;
	}

	.lede {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem 1.25rem;
	}

	ul {
		padding-left: 1.25rem;
	}

	li {
		margin-bottom: 0.4rem;
	}
</style>
