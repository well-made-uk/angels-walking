# Angels Walking Group

A small SvelteKit app for the Angels Walking Group. It shows the upcoming
walks, lets people add or remove their name, and collects (and upvotes) ideas for
future walks. The data is stored in Appwrite.

Walkers don't have passwords. The first time someone joins a walk, votes or
suggests something, a pop-up asks for their email:

- **Log in:** if we know the email, we show "Welcome back, Jane. Is this you?"
  and they're in.
- **Sign up:** for a new email we also ask their name, then check "Does this
  look right?" before creating their walker record.

**Log in and sign up** both need the **group passphrase**, which lives in the
WhatsApp group description. It's only stored in the database (the `settings` table), never in this
(public) repo.
Capitals, spaces and punctuation are ignored. There's also a hidden honeypot
field that bots tend to fill in. The **server** checks the passphrase and only
then hands back a signed walker token. Every walker action and name lookup needs
that token, and the server checks it too, so neither someone's email nor the
public site is enough to act as them.

The passphrase and the token-signing secret live in the `settings` table of the
`angels_walking` database, which has no public permissions (only the server's
API key can read it). To change the passphrase, edit the `signup_passphrase`
row in the Appwrite console (Databases → Angels Walking → Settings): lowercase,
letters and numbers only. It applies within a minute.

Changing the passphrase doesn't log anyone out. People only need it again when
they next log in on a new device.

Replacing the `token_secret` row with a new random value logs every walker out.

Their browser remembers them (localStorage), with a "Not you? Log out" link.
Every walker has a record in the `walkers` table, keyed by email, which all their
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
logged-in walkers. That's enforced on the server: the tables have no
public permissions, and walkers only get data through `/api/me`, which needs
their walker token. The site also asks search engines not to list
it (`robots.txt` and a `noindex` tag). Logged-in walkers see the next two
walks.

## Running locally

```bash
cp .env.example .env   # then add an Appwrite API key
npm install
npm run dev
```

The API key needs the scopes `databases.read`, `databases.write`, `tables.read`,
`tables.write`, `rows.read`, `rows.write`, `files.read`, `files.write`,
`users.read`, `sessions.write` and `sessions.read`. Create it in the Appwrite
console under the **well-made-apps** project → Overview → API keys.

## Database

Everything lives in the **well-made-apps** Appwrite project, in its own
`angels_walking` database (so it never mixes with the other apps' data).
None of the tables have public permissions: only the server's API key can read or
write them.

| Table | What's in it |
| --- | --- |
| `walks` | The walks. Managed by organisers at /organiser. |
| `signups` | Who's going to which walk. |
| `suggestions` / `suggestion_votes` | Walk ideas and hearts. |
| `date_votes` | Which weekend days people can make, for walks being voted on. |
| `walkers` | Everyone who has used the site, keyed by email (name, last seen). |
| `settings` | The group passphrase and the token secret. |

Appwrite has no foreign keys, so the server does the tidying itself: deleting a
walk removes its sign-ups, votes and route image, and removing an idea removes its
hearts. To delete a walker who asks to be forgotten, delete their rows from
`walkers`, `signups`, `suggestions`, `suggestion_votes` and `date_votes` (search
each table's `walker_email`).

Route images are stored in the private `angels_routes` storage bucket and shown
through `/api/route-image/<id>`. The image id is random and only sent to
logged-in walkers and organisers.

## Organiser guide

Sign in at **/organiser** with a one-time code: enter your email, then type
in the code Appwrite emails you. There are no passwords, and the form can never
create an account: it only sends a code to an existing Appwrite user whose
account has the `angelsOrganiser` label.

To make someone an organiser, add them as a user in the Appwrite console
(Auth → Users → Create user, using their email) and add the label
`angelsOrganiser` under their **Labels**. Other apps in this project share the
Auth users, and only people with that label can use /organiser.

Appwrite's built-in email sender is fine for a few codes; if emails stop arriving,
set up your own SMTP under Settings → SMTP in the project.

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
make. Voting **opens 5 weeks before the earliest day on offer and closes 3
weeks before it** (at midnight), so people vote close enough to the date to know
their plans. Before it opens, walkers see when it opens and can't vote; the
server enforces this too. You can pick an earlier deadline with "Choose an
earlier deadline", but not a later one, and not before voting opens. If the
earliest day is less than 3 weeks away there's no time for a vote, so untick the
earliest days or use a fixed date. When voting closes the day
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
scheduled job is needed. To change when voting opens and closes, edit
`VOTE_OPEN_DAYS` (35) and `VOTE_LEAD_DAYS` (21) in `src/lib/walks.ts`. Opening
time is worked out from the earliest day on offer, so it isn't stored.

**Cancelling:** tick "This walk is cancelled" when editing. It stays on the page,
marked as cancelled. "Delete this walk" removes it completely, along with its
sign-ups and votes.

**Removing someone:** open the walk and press "Remove" next to their name.
That page also lists everyone's email, with a "Copy emails" button for sending
updates.
Suggestions can be removed from the organiser dashboard.

Walks drop off the public page 3 hours after they start. Times are UK time
(`TIME_ZONE` in `src/lib/format.ts`, and `src/lib/server/time.ts`).

## Deploying

The site runs on **Appwrite Sites** (server-side rendering, `@sveltejs/adapter-node`)
in the same project as the data. In the Appwrite console create a site from this
repository with:

- Framework: SvelteKit, with **Server side rendering** switched on
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `./build`

and add these environment variables (Sites → Settings → Environment variables):
`AW_PROJECT_ID`, `AW_API_KEY` and, optionally, `AW_ENDPOINT` and
`AW_DATABASE_ID` (see `.env.example`).
