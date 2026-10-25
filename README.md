# ke8oir.com

Source for the personal amateur radio site of **KE8OIR** in Middletown, Ohio: local events, nets, repeaters, clubs, special event pages, and a beginner's guide to getting licensed.

It is a **static site**: a small [Eleventy](https://www.11ty.dev/) build turns the files in this repo into plain HTML/CSS/JS in `dist/`, which you upload to the host. No server-side code, no database, no CMS, no tracking, and no third-party fonts or scripts.

## Contents

1. [Quick start](#1-quick-start)
2. [Project layout](#2-project-layout)
3. [Everyday tasks](#3-everyday-tasks): add an event, a special event page, a repeater/net/club; change the theme; switch apex/www
4. [How "upcoming" works](#4-how-upcoming-works)
5. [Deploying](#5-deploying): which method, one-time SSH setup, Method A, Method B, SFTP fallback, troubleshooting
6. [Hosting notes](#6-hosting-notes-htaccess-https)
7. [Tests and what has been verified](#7-tests-and-what-has-been-verified)
8. [Assumptions and your TODO list](#8-assumptions-and-your-todo-list)

---

## 1. Quick start

You need **Node.js 22** (the version is pinned in `.nvmrc`). With [nvm](https://github.com/nvm-sh/nvm): `nvm install && nvm use`.

```bash
npm ci               # install exactly what package-lock.json says
npm start            # live preview at http://localhost:8080, rebuilds as you edit
npm run build        # one-off production build into dist/
npm test             # unit tests, plus checks on the built output (build first)
```

The single command that CI and Method B use is `npm ci && npm run build`. The output is the `dist/` folder, which is uploaded as-is.

To preview how the site will look on another date (for example, to see events move to "past"):

```bash
BUILD_NOW=2026-12-01T12:00:00Z npm run build      # macOS/Linux/Git Bash
```

When you build, you'll see a reminder of how many sample entries and `[TODO` placeholders remain. See [section 8](#8-assumptions-and-your-todo-list).

---

## 2. Project layout

```
data/                    <- the files you edit most
  site.yaml                site-wide settings (callsign, canonical host, contact link)
  events.yaml              all events (drives Home, Events, calendar feed)
  repeaters.yaml           repeaters      } shown on the Local Info page
  nets.yaml                nets           }
  clubs.yaml               clubs & meeting places
  nav.yaml                 the main menu
src/
  index.njk, events.njk, ...   the pages (Nunjucks templates)
  special-events/              one .md file per special event page
  _includes/layouts/           page layouts (base, special-event)
  _includes/partials/macros.njk  the event card markup
  assets/css/style.css         ALL colors, type and spacing live here as CSS variables
  assets/js/upcoming.js        the tiny "hide ended events" script
  assets/img/                  favicon, default social-preview image, photos
  htaccess.njk                 generates dist/.htaccess
  calendar.11ty.js, ...        generate the .ics feed, sitemap, robots.txt
starters/special-event.md  <- documented template to copy for a new special event
lib/                       build-time helpers (time zones, event parsing, .ics writer)
scripts/deploy.mjs         Method A and Method B both run this
deploy/excludes.txt        host-managed files that deploys never touch
.github/workflows/deploy.yml   Method B (GitHub Actions)
test/                      unit tests + built-output checks
```

---

## 3. Everyday tasks

### Add an event

Open `data/events.yaml` and add an entry. Copy a sample and change it:

```yaml
- title: "Winter Field Day Planning Meeting"
  type: meeting                    # net | meeting | exam | field-day | special-event | other
  start: "2027-01-12 19:00"        # 24-hour, New York time
  end: "2027-01-12 20:30"          # optional
  location: "Middletown Public Library"
  address: "Street address of the public venue"   # used to make a map link
  description: "One or two sentences."
  link: "https://example.com/more-info"           # optional
```

Rules of thumb:

- **Times are New York wall-clock time.** Don't convert to UTC and don't think about daylight saving. The build converts correctly, labels times "EST" or "EDT" as appropriate, and fails with a clear message if you pick a time that doesn't exist (2:30 AM on the spring-forward night).
- **All-day events:** give only a date, `start: "2027-02-06"`. For multi-day, add `end` with the *last* day (inclusive).
- **No end time?** Fine. The event stays "upcoming" for `defaultEventHours` (default 2, set in `data/site.yaml`) and no end time is shown.
- **Link it to a special event page** by adding `slug: my-event` (see below).
- **Recurring things:** list the regular schedule in `data/nets.yaml` or `data/clubs.yaml`, and add a dated entry here for the occurrences you want on the calendar.
- Set `updated: "2027-01-05"` when you change an existing event, so calendar apps notice the change.
- Delete very old events occasionally to keep the file tidy. Past events show in the collapsed "Past events" list on the Events page.

Every field is documented in the comment block at the top of `data/events.yaml`.

Each event automatically gets an **Add to calendar** link (`/events/<id>.ics`), and everything appears in the subscribable feed at `/calendar.ics`.

### Add a special event page

1. **Copy** `starters/special-event.md` to `src/special-events/<slug>.md`. The file name becomes the URL: `src/special-events/lunken-airport-days.md` becomes `/special-events/lunken-airport-days/`. Use lowercase letters, digits and dashes.
2. **Fill in the front matter** (the block between the `---` lines). It's commented line by line. Delete any optional field you don't need: empty sections are skipped cleanly. Supported fields:

   | Field | Purpose |
   |---|---|
   | `title`, `tagline` | Name, and one sentence used in link previews |
   | `start`, `end` | Dates/times (New York time; same format as events) |
   | `event_callsign` | Special event callsign, if any |
   | `location_name`, `address`, `map_url`, `access`, `parking` | Where, and how to get in |
   | `explainer` | "What is this event?" for the public (a string, or a list of paragraphs) |
   | `frequencies` | List of `frequency` / `mode` / `notes` |
   | `schedule` | List of `time` / `activity` |
   | `qsl` | `how`, `certificate`, `url`, `url_label` |
   | `gallery` | List of `src` / `alt` / `caption` / `width` / `height` |
   | `contact` | Overrides the site-wide contact link |
   | `og_image`, `og_image_alt`, `description` | Link-preview overrides |

3. **Photos:** put them in `src/assets/img/special-events/<slug>/` and reference them as `/assets/img/special-events/<slug>/photo.jpg`. Alt text is required for each.
4. **(Optional) put it on the calendar:** add an entry to `data/events.yaml` with `slug: <slug>`. The event then appears on Home/Events and links to the page. The build warns if a `slug` has no matching page.
5. `npm run build`. The page is at `/special-events/<slug>/`, listed on the Special Events index (upcoming first, then past), has an **Add to calendar** button, and includes Open Graph tags, so it previews nicely when shared.

Don't publish a home address, and avoid a mailing address for QSL cards: use an online route, a PO box, or the QSL manager's public instructions. The sample page (`sample-special-event.md`) is hidden from search engines; **delete it** when you have real content.

### Add a repeater, net, or club

Edit `data/repeaters.yaml`, `data/nets.yaml`, or `data/clubs.yaml`. Each file starts with a comment block that documents every field. Copy an existing entry and change it. Entries appear on the Local Info page in file order. Use `[TODO: ...]` for anything you haven't confirmed, and set `verified: "2027-01"` once you have, so the page shows "Last confirmed". Never guess a frequency or tone.

### Change the theme

Everything visual is controlled by CSS variables at the top of `src/assets/css/style.css`, so page markup never needs to change:

- **Colors:** the first `:root` block is the light theme, and the `@media (prefers-color-scheme: dark)` block overrides it for dark mode. The main amber is `--color-accent`, and `--color-accent-strong` is the darker amber used for text on light backgrounds. To re-theme to blue, change those values (and the matching `--color-link`, `--color-button-bg`).
- **Contrast:** keep body text at least 4.5:1 against its background and UI outlines at 3:1. Amber on cream is too light for text, which is why there are separate `-accent` (decoration) and `-accent-strong` (text) values.
- **Type scale:** `--step--1` to `--step-4`. **Spacing:** `--space-3xs` to `--space-2xl`. **Fonts:** `--font-sans` and `--font-mono` use system fonts, so nothing is downloaded. To self-host a font, put the `.woff2` in `src/assets/fonts/`, add an `@font-face` rule, and put its name first in the variable.
- **Layout:** `--maxw` (page width), `--measure` (line length), `--radius`.
- **Logo and icons:** `src/assets/img/favicon.svg`, and the S-meter in the header is inline SVG in `src/_includes/layouts/base.njk`.
- **Social-preview image:** replace `src/assets/img/og-default.png` with your own 1200×630 PNG.

### Switch between `ke8oir.com` and `www.ke8oir.com`

Change **one line** in `data/site.yaml`:

```yaml
canonicalHost: ke8oir.com        # or: www.ke8oir.com
```

That drives the `.htaccess` redirects, canonical URLs, sitemap, Open Graph URLs, and calendar IDs. Rebuild and redeploy.

### Edit page text

Static pages are in `src/` (`about.njk`, `get-started.njk`, etc.). They're HTML with a little templating. The `{{ ... }}` bits pull in data, so leave those alone. The About page has `[TODO]` blocks for you to write in your own words.

---

## 4. How "upcoming" works

- **At build time**, Home and Events list only events that haven't ended, sorted by date. Everything else goes to "Past events". This is what you get with JavaScript disabled, and it's what search engines see.
- **In the browser**, a ~1 KB script (`upcoming.js`) removes events whose end time has passed, moves them into the Past list, and updates the count, so an event leaves "Upcoming" at the right moment even if you haven't rebuilt. It re-checks every minute while the page is open.
- "Ended" means: the `end` time; or, with no `end`, the start plus `defaultEventHours`; or, for all-day events, the end of the last day (New York time).
- Rebuilding daily (optional; see Method B) keeps the *static* HTML fresh too, which matters for visitors without JavaScript.
- The `.ics` feed contains every event in `events.yaml`, past and future. Calendar apps handle that fine.

---

## 5. Deploying

Both methods run the same script, `scripts/deploy.mjs`, with the same rsync options and the same exclusion list (`deploy/excludes.txt`), so **the same commit gives the same files on the server either way.**

### Which should I use?

| | **A: local build + upload** | **B: GitHub Actions** |
|---|---|---|
| Runs on | Your computer | GitHub's servers |
| Setup | `.env` file + SSH key | GitHub repo + 2 secrets + 4 variables |
| Needs your computer on | Yes | No |
| Where the key lives | Your machine | GitHub Secrets (a second copy of the key) |
| Needs `rsync` locally | Yes (Windows: WSL or Git Bash) | No (the runner has it) |
| Automatic/daily refresh | No (unless you script it) | Yes (uncomment one block) |
| Trail of who deployed what | No | Yes (Actions log) |
| Best for | Quick edits, trying it out | "Push to publish", hands-off refreshes |

A reasonable path: start with Method A (fewer moving parts), then add Method B once you want push-to-publish or a daily refresh. They don't conflict.

### One-time setup (both methods): SSH access on cPanel

> Menu names vary a little between cPanel versions, and I couldn't check NameCrane's specific setup. If **SSH Access** isn't in your cPanel, ask NameCrane support to enable it. **Don't assume the SSH port is 22**; look on the SSH Access page or in your welcome email.

1. **Generate a dedicated key pair** on your computer (use a separate key for each method so you can revoke either one independently; a passphrase is good for Method A, but Method B's key can't have one):

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/ke8oir_deploy -C "ke8oir.com deploy (local)"
   ```

   This makes `ke8oir_deploy` (private, never share) and `ke8oir_deploy.pub` (public).
2. **cPanel → Security → SSH Access → Manage SSH Keys → Import Key.** Give it a name, paste the contents of `ke8oir_deploy.pub` into the *public key* box, and import. (Paste only the public key.)
3. Back on the key list, click **Manage** next to the new key and **Authorize** it.
4. **Test the connection** (replace the port, user and host with yours):

   ```bash
   ssh -i ~/.ssh/ke8oir_deploy -p PORT cpanelusername@your-server.example.com "pwd && ls -la public_html"
   ```

   The first time, ssh shows the server's fingerprint and asks you to confirm. **Write the fingerprint down** (you'll check it again for Method B), and ideally confirm it with NameCrane. You should see your home directory (like `/home/cpanelusername`) and a `public_html` folder.
5. Check that the host has rsync: `ssh -i ... -p PORT user@host "rsync --version"`. If not, use the [SFTP fallback](#sftp-fallback-if-rsync-isnt-available-on-the-host).

### Method A: build and upload from your computer

1. **Configure:** `cp .env.example .env` and fill in:

   | Variable | Example |
   |---|---|
   | `DEPLOY_HOST` | `your-server.example.com` |
   | `DEPLOY_PORT` | the port from cPanel (may not be 22) |
   | `DEPLOY_USER` | your cPanel username |
   | `DEPLOY_SSH_KEY` | `~/.ssh/ke8oir_deploy` |
   | `DEPLOY_REMOTE_PATH` | `/home/<user>/public_html` |

   `.env` is git-ignored. Never commit it.
2. **First dry run** (shows what *would* change, changes nothing):

   ```bash
   npm run deploy:dry
   ```

   Read the list. `>f+++++++++` is a new file, `>fc.T......` is an updated one, `*deleting` is a file that would be removed. On a fresh site you should see no surprises. If you see `*deleting` for anything you care about, stop and check the remote path.
3. **First real deploy:**

   ```bash
   npm run deploy
   ```

   The very first `npm run deploy` against a server **only does a dry run** and tells you so. Run it again and it shows a summary (files to upload, files to delete), then asks you to type `deploy`. For scripts, use `npm run deploy -- --yes`.
4. Visit the site and check it. Later deploys are just `npm run deploy`.

Safety features: it **never deletes outside `DEPLOY_REMOTE_PATH`**; it **refuses short or odd remote paths** (like `/` or `/home/user`); it **never touches** `.well-known/` (AutoSSL certificate validation), `cgi-bin/`, or the other host-managed items in `deploy/excludes.txt`; it refuses to run if `dist/` is missing or incomplete; and `--no-delete` uploads without removing anything.

Options: `npm run deploy -- --no-delete`, `--no-build`, `--yes`. Run `node scripts/deploy.mjs --help` for the list.

### Method B: GitHub Actions

1. **Create a GitHub repository** (private is fine) and push this project to it. `.env`, `node_modules/` and `dist/` are already git-ignored.
2. **Make a separate deploy key** for CI, with **no passphrase** (CI can't type one), and authorize it in cPanel exactly as above:

   ```bash
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/ke8oir_deploy_ci -C "ke8oir.com deploy (GitHub Actions)"
   ```
3. **Get the server's host key** so the workflow can verify it instead of trusting whatever answers:

   ```bash
   ssh-keyscan -p PORT -t ed25519,ecdsa,rsa your-server.example.com > host_keys.txt
   ssh-keygen -lf host_keys.txt         # compare these fingerprints with the one you wrote down earlier
   ```

   Only continue if a fingerprint matches what the server showed you in the first manual connection. (Pasting an unchecked scan trusts whatever answered at that moment.) The file contents become a secret.
4. **Add to GitHub:** repository → **Settings → Secrets and variables → Actions**.

   *Secrets* (tab "Secrets"):

   | Name | Value |
   |---|---|
   | `DEPLOY_SSH_PRIVATE_KEY` | the full contents of `~/.ssh/ke8oir_deploy_ci` (the *private* key, including the BEGIN/END lines) |
   | `DEPLOY_KNOWN_HOSTS` | the contents of `host_keys.txt` |

   *Variables* (tab "Variables"; these may also be stored as secrets if you prefer):

   | Name | Value |
   |---|---|
   | `DEPLOY_HOST` | `your-server.example.com` |
   | `DEPLOY_PORT` | the port from cPanel |
   | `DEPLOY_USER` | your cPanel username |
   | `DEPLOY_REMOTE_PATH` | `/home/<user>/public_html` |

   Then delete `host_keys.txt` and the CI private key from your computer if you don't need them.
5. **First run:** **Actions** tab → **Deploy to web host (rsync over SSH)** → **Run workflow**. The **dry run** box is ticked by default. Open the run and read the *Deploy* step's list, the same output as Method A's dry run.
6. **First real deploy:** run it again with the dry-run box **unticked**.

What the workflow does: checks out the repo; installs the Node version from `.nvmrc`; runs `npm ci` and `npm run build`; runs `npm test` (so a broken build is never uploaded); sets up the key with **strict host-key checking** against your pinned `DEPLOY_KNOWN_HOSTS`; runs `scripts/deploy.mjs --ci`; and deletes the key material. A `concurrency` group means two deploys can never run at the same time.

**Triggers.** It's **manual only** by default. To change that, edit `.github/workflows/deploy.yml` and remove the leading `# ` from the block you want (the file explains each):

- **Deploy on every push to `main`:** uncomment the `push:` block.
- **Rebuild daily** (keeps the static "upcoming" lists fresh): uncomment the `schedule:` block. GitHub's cron is **UTC and ignores daylight saving**, and GitHub pauses scheduled workflows after 60 days without repository activity (re-enable it in the Actions tab).

Push and scheduled runs always deploy for real; only manual runs have the dry-run checkbox.

The actions are pinned to major version `v4`, and `.github/dependabot.yml` will open a monthly pull request when newer versions exist. Delete that file if you'd rather not.

### SFTP fallback (if rsync isn't available on the host)

SFTP can't do everything rsync does: it won't normalize file permissions, and unless you do it by hand, it won't remove files you've deleted from the project. Check the result after uploading.

**Easiest:** build (`npm run build`), then use any SFTP client (FileZilla, Cyberduck, WinSCP) with host, **your SSH port**, your cPanel username and the same key. Upload the *contents* of `dist/` into `public_html/`, overwriting. **Don't touch** `.well-known/` or `cgi-bin/`. Make sure the hidden `.htaccess` file is included; many clients hide dotfiles by default, so turn on "show hidden files". Or zip the contents of `dist/` and use cPanel **File Manager → Upload → Extract**.

**Command line with `lftp`** (an example; I could not test it here, so run it with `--dry-run` first):

```bash
npm run build
lftp -p PORT -u cpanelusername, sftp://your-server.example.com <<'EOF'
set sftp:connect-program "ssh -a -x -i $HOME/.ssh/ke8oir_deploy"
mirror -R --only-newer --verbose --dry-run dist/ /home/cpanelusername/public_html
EOF
```

Remove `--dry-run` when the list looks right. This version never deletes anything on the server, so remove pages you've retired through your SFTP client or File Manager.

### Troubleshooting

| You see | Likely cause |
|---|---|
| `Permission denied (publickey)` | The key isn't *authorized* in cPanel, the username is wrong, or `DEPLOY_SSH_KEY` points at the wrong file |
| `Connection timed out` / `refused` | Wrong `DEPLOY_PORT` or host, or SSH isn't enabled for the account |
| `Host key verification failed` | The known-hosts entry doesn't match the server (a changed server key, or a wrong/old secret) |
| `rsync: command not found` (remote) | The host doesn't provide rsync; use the SFTP fallback |
| `too short to be a safe web root` | `DEPLOY_REMOTE_PATH` should be like `/home/<user>/public_html` |
| Site shows old events after deploy | Pages are cached for 10 minutes; hard-refresh. Also confirm the deploy actually finished |
| Redirect loop after deploy | Check your DNS/SSL; see [Hosting notes](#6-hosting-notes-htaccess-https) |

---

## 6. Hosting notes: `.htaccess`, HTTPS

`dist/.htaccess` is **generated** from `src/htaccess.njk`; edit the template, not the output. It provides:

- A redirect from the non-canonical host to the canonical one (see `canonicalHost`) and from HTTP to HTTPS. Both leave `/.well-known/` alone so AutoSSL renewals keep working.
- Clean URLs (`/events/index.html` redirects to `/events/`) and a custom `/404.html`.
- Caching: CSS/JS carry a content hash in the URL (`style.css?v=…`) and are cached for a year; HTML, XML and `.ics` for 10 minutes; images for 30 days.
- Brotli (where available) or gzip compression.
- Security headers, including a strict Content-Security-Policy that allows only this site's own files. If you embed a map or video later, add its origin there.
- **HSTS is deliberately off**: browsers would refuse plain HTTP for a year afterward. Turn it on (it's one commented line) only after you're confident HTTPS works everywhere.

Notes:
- cPanel sometimes adds its own blocks to `.htaccess` (for example PHP version handlers). A static site doesn't need them, and a deploy replaces the file.
- To test on a temporary URL before DNS points at the host, the HTTP→HTTPS redirect keeps whatever host you used, but the www/apex redirect will send you to the real domain.
- Make sure the site's SSL certificate (AutoSSL) is issued for both `ke8oir.com` and `www.ke8oir.com` before relying on the redirect, so visitors to the non-canonical name don't see a certificate warning first.

---

## 7. Tests and what has been verified

`npm test` runs:

- **Unit tests** for time handling (EST/EDT, the spring-forward gap, the fall-back hour, all-day events), event sorting and the upcoming/past split, and the calendar writer (escaping, line folding, CRLF).
- **Built-output checks** (when `dist/` exists): `.htaccess` has no corrupted rules; the required files exist; no request goes to a third-party host; no inline scripts or styles (so the CSP is safe); every page has title, description, canonical and Open Graph tags; every image has alt text; the calendar feed is well-formed.

**Verified during development:** all of the above; the rsync flags against a stand-in web root (stale files removed, `.well-known/`, `cgi-bin/` and `error_log` kept, files outside the target untouched, permissions normalized, a second run changes nothing); how rsync hands arguments to ssh (including a key path with spaces and a non-22 port); the first-use dry-run gate and typed confirmation; and rejection of unsafe remote paths.

**Not verified, because I had no access:** a real SSH connection to NameCrane; an actual GitHub Actions run (the workflow was written carefully but never executed); the real `.htaccess` behavior on your Apache (rules were reviewed, not run); and the `lftp` example. Do the first dry run of each method before trusting it, as described above.

---

## 8. Assumptions and your TODO list

### Things I assumed (change any of them)

- **Eleventy 3 with Nunjucks**, plain hand-written CSS, system fonts, Node 22. The only dev dependencies are Eleventy and `js-yaml`.
- **Canonical host is the apex** (`ke8oir.com`), set by one line in `data/site.yaml`.
- Data files are YAML, and **dates stay plain text** (so a missing quote can't silently shift a time). Times are always New York time; the zone is fixed in `lib/time.js`.
- An event with no end time counts as "upcoming" for **2 hours** after it starts; all-day events count through the end of their last day.
- Event types are `net`, `meeting`, `exam`, `field-day`, `special-event`, `other`.
- A special event page carries its **own dates** in its front matter; a matching `events.yaml` entry (with `slug`) is optional and is used for the calendar and Home/Events lists. The two aren't linked automatically, so keep them in sync.
- The `.ics` feed lists **all** events (past included) in UTC, with a stable `DTSTAMP` so builds are reproducible. Past events are best deleted every so often.
- Sample entries and the sample special event page are **hidden from search engines** (`noindex`, not in the sitemap).
- No dark-mode toggle: the site follows the visitor's system setting.
- A strict CSP is on, and HSTS is off.
- GitHub Actions are pinned to `@v4`; I couldn't check for newer majors (Dependabot will).
- The default social-preview image is a simple generated placeholder.
- The coverage area is the six towns you listed (`communities` in `data/site.yaml`).

### Things left for you to fill in

- [ ] **Contact link** in `data/site.yaml` (currently `#TODO-contact-link`). Use a `mailto:` link, a form URL, or your QRZ page; no phone or home address.
- [ ] **About page:** your story and what you operate (two `[TODO]` blocks in `src/about.njk`). Optional QRZ link in `data/site.yaml`.
- [ ] **Replace every sample** in `data/events.yaml`, `repeaters.yaml`, `nets.yaml`, `clubs.yaml`, and **delete** `src/special-events/sample-special-event.md`. Search the project for `[TODO` and `sample: true` (the build prints counts).
- [ ] **Confirm every repeater, net, club, time and frequency** before publishing; I deliberately invented none.
- [ ] **Get Started page:** I checked the Technician 2026–2030 question pool, the FCC's $35 application fee (since April 2022), the ARRL $15 exam fee, and the FRN requirement against ARRL's announcements, but fees can change, so re-confirm them. The beginner equipment price ranges and the HamStudy/HamExam links are my own general knowledge. Review the `[TODO]` notes there, and add any local exam sessions or classes you know of.
- [ ] **Review the `communities` list** in `data/site.yaml`.
- [ ] **Set up SSH on NameCrane** and fill in `.env` (Method A) and/or the GitHub Secrets and Variables (Method B). Confirm the SSH port.
- [ ] **Check HTTPS (AutoSSL) covers both `ke8oir.com` and `www`** before launch.
- [ ] Optionally replace the **social-preview image** and favicon, and pick your own accent color.
