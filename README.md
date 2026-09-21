# Angels Walking Group

A small SvelteKit app for the Angels Walking Group. It shows the upcoming
walks, lets people add or remove their name, and collects (and upvotes) ideas for
future walks. The data is stored in Supabase.

Walkers don't have passwords. The first time someone joins a walk, votes or
suggests something, a pop-up asks for their email:

- **Log in:** if we know the email, we show "Welcome back, Jane. Is this you?"
  and they're in.
- **Sign up:** for a new email we also ask their name, then check "Does this
  look right?" before creating their walker record.

**Log in and sign up** both need the **group passphrase**, which lives in the
WhatsApp group description. It's only stored in the database, never in this
(public) repo.
Capitals, spaces and punctuation are ignored. There's also a hidden honeypot
field that bots tend to fill in. The **database** checks the passphrase and only
then hands back a signed walker token. Every walker action and name lookup
needs that token, and the database checks it too, so neither someone's email
nor the public API key is enough to act as them.

The passphrase and the token-signing secret live in
`angels_private.settings`, a schema the API can't reach. To change them, run
this in the SQL editor:

```sql
-- New passphrase: lowercase, letters and numbers only.
update angels_private.settings set value = 'newpassphrase' where key = 'signup_passphrase';
```

Changing the passphrase doesn't log anyone out. People only need it again when
they next log in on a new device.

Replacing `token_secret` with a new random value logs every walker out.

Their browser remembers them (localStorage), with a "Not you? Log out" link.
Every walker has a record in `angels_walkers`, keyed by email, which all their
sign-ups, votes and suggestions link to, ready for stats later. The name shown
in the app always comes from that record.

**Privacy:** people who aren't logged in see counts ("5 going", "Suggested by a
walker") but no names. Names aren't sent to their browser at all. Emails are
never shown to walkers; only organisers see them, on each walk's page.

Only organisers sign in properly, at `/organiser`, using an emailed code.

The group is independent and **not run by, affiliated with or endorsed by any
charity or organisation**. The footer and the
[privacy page](src/routes/privacy/+page.svelte) say so. The site deliberately
doesn't name any organisation. Set a contact email for data requests in `src/lib/site.ts`.

**Members only.** Visitors who aren't logged in see only a welcome message.
Walk dates, meeting points, routes, names and suggestions are only for
logged-in walkers. That's enforced in the database: the tables are
organiser-only, and walkers get everything through `angels_walker_feed()`,
which needs their walker token. The site also asks search engines not to list
it (`robots.txt` and a `noindex` tag). Logged-in walkers see the next two
walks.

## Running locally

```bash
cp .env.example .env   # then fill in the Supabase URL and publishable key
npm install
npm run dev
```

## Database

The schema is in [`supabase/migrations`](supabase/migrations). It lives in the
**well-made-apps** Supabase project, and every table and function name starts
with `angels_`. [`supabase/seed.sql`](supabase/seed.sql) has example walks, which
are handy on a local or test database.

| Table | What's in it |
| --- | --- |
| `angels_walks` | The walks. Managed by organisers at /organiser. |
| `angels_signups` | Who's going to which walk. |
| `angels_suggestions` / `angels_suggestion_votes` | Walk ideas and hearts. |
| `angels_date_votes` | Which weekend days people can make, for walks being voted on. |
| `angels_organisers` | Accounts that can use /organiser. |
| `angels_walkers` | Everyone who has used the site, keyed by email (name, first/last seen). Deleting a walker deletes their sign-ups, votes and suggestions. |

Route images are stored in the private `angels-routes` storage bucket. Walkers
see them through signed links stored on each walk (`route_image_url`), which
are only sent to logged-in walkers. Only an organiser session can create these
links, so the organiser pages create and renew them automatically.

## Organiser guide

Sign in at **/organiser** with a one-time code: enter your email, then type
in the code Supabase emails you. There are no passwords, and the form can never
create an account (it uses `shouldCreateUser: false`, and anyone who isn't in
`angels_organisers` is signed straight back out).

Supabase sends the code using its **Magic Link** email template, which by
default only contains a link. Add the code to it: in the dashboard go to
**Authentication → Emails → Magic Link** and add a line such as
`Your sign-in code is {{ .Token }}`. Keep the existing link, because other apps
in this project share the template.

Supabase's built-in email sender only allows a few emails an hour and is meant
for testing. That's fine for one or two organisers. If links stop arriving, set
up your own SMTP under **Authentication → Emails**.

To add another organiser, they need a Supabase account in this project with
that email. Then run this in the SQL editor:

```sql
insert into angels_organisers (user_id)
select id from auth.users where email = 'their@email.com';
```

**Planning a walk:** press "Plan a walk", or "Plan this walk" next to a
suggestion. A walk made from a suggestion credits the person who suggested it,
and the idea leaves the public suggestions list. Every walk has a route
description, an optional route image, its length in km, roughly how long it
takes, and a difficulty. Big phone photos are shrunk in the browser before
upload.

**Choosing the date:** either pick a date yourself, or let the group vote.
For a vote, choose a date range (up to about three months). A calendar opens
with every **Saturday, Sunday and bank holiday** in that range already ticked;
tap any day to add or remove it. Walkers then tick every day on offer they can
make. Voting closes **2 weeks before the earliest day on offer**, or on your
own deadline if you tick "Choose a different deadline" (handy at short notice:
any day from today up to the day before the first option). Then the day
most people can make is locked in (ties go to the earliest day; with no votes,
the earliest day on offer). The walk then becomes a normal walk that people
sign up for. You can also close the vote early from the walk's page. If you
change the days while voting is open, votes for days you've removed are
dropped.

Bank holidays are the England and Wales list from GOV.UK, in
`src/lib/bank-holidays.ts`. GOV.UK publishes about two years ahead (currently
to the end of 2028), so add the next year's dates from
https://www.gov.uk/bank-holidays.json when they appear.

Locking happens the next time anyone opens the site after voting closes, so no
scheduled job is needed. To change the 2 weeks, edit `angels_vote_lead_days()`
in the database *and* `VOTE_LEAD_DAYS` in `src/lib/walks.ts`.

**Cancelling:** tick "This walk is cancelled" when editing. It stays on the page,
marked as cancelled. "Delete this walk" removes it completely, along with its
sign-ups and votes.

**Removing someone:** open the walk and press "Remove" next to their name.
That page also lists everyone's email, with a "Copy emails" button for sending
updates.
Suggestions can be removed from the organiser dashboard.

Walks drop off the public page 3 hours after they start. Times are UK time
(`TIME_ZONE` in `src/lib/format.ts`, and `Europe/London` in the migrations).

## Deploying

The app runs on the server (the Supabase key never goes to the browser), so it
needs a host that runs SvelteKit, such as Vercel, Netlify or Cloudflare.
`adapter-auto` detects the host automatically. Set `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` as environment variables on the host.
