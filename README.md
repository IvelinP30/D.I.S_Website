# D.I.S Подкаст Website

Modern public website and admin panel for D.I.S Подкаст, a football-focused podcast and social media brand.

Live site: https://dis-podcast.onrender.com

## What It Is

- Public brand website for Instagram/TikTok/YouTube/Facebook
- Separate „Новини от D.I.S“ listing plus dedicated detail pages with manually managed title, compact excerpt, full article, photo and caption
- A visually smaller „D.I.S Футболен вестник“ grid below the manual posts, populated server-side from Bulgarian-language NewsData.io football headlines
- Separate Fan Zone, Hosts, Partnerships, and Contact pages
- Fan voting with host predictions, animated results, and one signed visitor vote per poll
- Multiple D.I.S Prediction Leagues with one shared nickname-only profile, period-aware positions, separate matches, points, streaks, trophies and standings, plus recovery codes
- Free TheSportsDB round import, kickoff/status/result synchronization and a locally searchable team-logo catalogue, with protected server-side quotas and caching
- Optional Fan Zone giveaway registration with protected participants, CSV export, and random winner drawing
- Contact, partnership, and fan-idea forms stored in a protected admin inbox, with production email notifications
- Presents the channel as a football media brand
- Includes sponsor packages and active ad placements
- Shows active ads in a horizontal marquee below page hero sections
- Uses full-viewport hero sections on every public page, with ads beginning after the first viewport
- Uses restrained hero image/text entrance transitions instead of heavy page-to-page animations
- Adds playful football UI details: field-line ornaments, live dots, button motion, and subtle card animations
- Uses a restrained set of generated transparent football stickers between channels and YouTube, beside formats, and around the advertising menu
- Adds brighter CTA motion and matching interactive effects across header and footer controls
- Includes a shared footer on public pages with brand links, social links, and email contact
- Includes copyright, controller identity, privacy, and cookie links in every public footer
- Includes dedicated Privacy and Cookie Policy pages for the live data flow
- Includes a YouTube player block controlled from admin
- Includes a password-protected admin panel
- Stores editable content in `data/content.json`, votes in `data/votes.json`, inbox messages in `data/messages.json`, local giveaway entries in `data/giveaway-entries.json`, local Prediction League participation in the ignored `data/prediction-league.json`, and the rolling external-news cache in ignored `data/press-news-cache.json`
- Supports uploads for logo, hero backgrounds, ad media, and news images
- Uses a generated football podcast hero image in `assets/hero-football-podcast.png`
- Uses the D.I.S logo in `assets/dis-logo.png` as the navbar mark and favicon
- Uses generated football visuals for the news hero and scroll progress indicator
- Can be installed as a lightweight PWA on supported desktop and mobile devices

## How To Preview

From this folder:

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4177/
http://127.0.0.1:4177/news
http://127.0.0.1:4177/news/<article-slug>
http://127.0.0.1:4177/fan-zone
http://127.0.0.1:4177/hosts
http://127.0.0.1:4177/partners
http://127.0.0.1:4177/contact
http://127.0.0.1:4177/privacy
http://127.0.0.1:4177/cookies
http://127.0.0.1:4177/login
```

## Progressive Web App

The eight public pages expose a shared web app manifest and can be installed in standalone mode. On Chromium browsers, a conditional **Добави като приложение** control appears in the public footer only when the browser reports that installation is available. On Safari for iPhone and iPad, the same control shows the manual **Share → Add to Home Screen** steps. Safari 17+ on Mac also shows the control with **Share → Add to Dock** instructions; creating a Mac web app requires macOS Sonoma 14 or newer. The control stays hidden on other unsupported devices and when the site is already running as an installed app.

The protected admin page has a separate **D.I.S Админ** manifest with its own app identity and `/admin` start URL. Its conditional **Добави админ приложение** control uses the same design as the public footer installer and sits separately at the top-right of the admin hero. The installed admin app can require a fresh login when the saved session has expired or when the platform keeps web-app site data separate from the browser; the normal login flow then returns to the admin panel.

The service worker provides a branded offline fallback and caches only same-origin static assets. Cache Storage can be created on the first supported public-page visit even when the visitor does not install the app. Navigation stays network-first, and API requests, admin/login routes, analytics configuration, form submissions, voting, and giveaway operations are never handled by the PWA cache. The feature adds no tracking, cookies, user-data collection, profiling, push notifications, or background synchronization. Visitors can remove the technical cache through their browser's site-data controls or when uninstalling the web app.

The public Privacy and Cookie policies disclose the PWA installation flow, service worker, technical Cache Storage, cached resource types, exclusions, removal controls, and the separation from optional Analytics consent. Update those disclosures and the displayed policy dates whenever the cache scope or PWA data handling changes.

The footer **Настройки** control remains visible even when `GA_MEASUREMENT_ID` is not configured. In that state it opens a read-only notice confirming that Analytics and analytics cookies are inactive; it never shows the first-visit consent prompt because there is no optional analytics processing to accept.

When the browser reports that the device is offline, both the public and admin web apps keep the last rendered page visible and show a fixed Bulgarian status bar explaining that the content may be previously loaded and interactive operations are temporarily unavailable. The bar reacts to the browser's `online` and `offline` events and disappears automatically when connectivity returns. A completely uncached navigation can still fall back to the dedicated `offline.html` page.

Installed touch PWAs provide a custom pull-to-refresh gesture only when the page is already at the top. The content follows the finger with progressively stronger resistance while a compact indicator reveals the 96-pixel release threshold; supported Android/Chromium devices also receive stepped vibration feedback. Releasing past the threshold holds the content in its refresh position, refreshes the current API-backed public or admin content without navigation or a full page reload, and locks touch scrolling while the indicator spins. Once the update finishes, the indicator fades out first; the content then returns smoothly to rest and normal downward scrolling resumes. Offline attempts preserve the current view. WebKit does not expose the Vibration API, so iPhone and iPad use the same visual interaction without haptic feedback.

## Protected Admin

Create a local `.env` file:

```bash
ADMIN_PASSWORD="choose-a-strong-password"
SESSION_SECRET="choose-a-long-random-secret"
FOOTBALL_SYNC_SECRET="optional-secret-for-external-scheduler"
NEWSDATA_API_KEY="optional-newsdata-key"
NEWSDATA_QUERY="футбол"
NEWSDATA_BULGARIAN_QUERY="Левски OR ЦСКА OR Лудогорец OR efbet лига OR национален отбор"
NEWSDATA_LANGUAGE="bg"
NEWSDATA_MAX_ITEMS=20
```

Then run:

```bash
npm start
```

The public site reads content from `GET /api/content`.
The admin saves content with `PUT /api/content`, protected by a signed session cookie.

Voting and reactions create a long-lived signed `dis_voter` cookie only after the visitor submits an interaction. Merely opening Fan Zone, reading poll results, or viewing reaction totals does not create it. The cookie keeps one selection per poll, host prediction, and D.I.S news item without requiring accounts. A visitor can change a news reaction or prediction opinion; the previous count is removed before the new one is added. Clearing cookies or deliberately changing identity can bypass this, which is acceptable for the intended entertainment use.

`GET /api/engagement` returns only aggregate counts and the current browser's selection. `POST /api/engagement/news/:newsSlug` records one of the fixed news reactions, while `POST /api/engagement/predictions/:predictionId` records agree/disagree. Both reuse the protected vote store (`data/votes.json` locally and the `votes` row in Supabase `app_state` in production); voter hashes and raw cookie values are never returned publicly.

Each visitor can vote once in every separate poll. Deleting a poll from admin also removes its stored vote records on the next content save.

Prediction Leagues use one shared nickname instead of separate accounts. Creating or recovering participation sets a signed, `HttpOnly` `dis_league` cookie that contains only an anonymous player ID and integrity signature. Its 400-day lifetime is renewed after every authenticated League visit, nickname change, or saved prediction, allowing an active browser to remain connected indefinitely. The server-side participation and points do not expire automatically. A one-time recovery code reconnects the same shared profile on a different browser or phone; only its keyed hash is stored, never the readable code. Nicknames are globally unique after case, spaces, dots, hyphens, and underscores are normalized; mixing Cyrillic and Latin letters in one nickname is rejected. Each configured league has separate matches, points, streaks, trophies and weekly/monthly/season standings. A participant enters a league's table after making a prediction there.

The shared profile also has one cross-league level based only on predictions whose matches already have final results. Early levels use quick triangular thresholds, followed by progressively larger steps; levels 10, 20, 30, 40 and 50 require 45, 125, 245, 405 and 605 completed participations. Every level carries a football progression title, from Debutant and Young Talent through Playmaker, Captain, Maestro and Immortal Legend. Each successive level adds tier-specific rim symbols instead of generic dots, the second half of every ten-level rank unlocks larger layered wings, and the following levels add a lower plate, shoulder blades, top crest and expanded outer rail. Color ranks progress through starter, bronze, silver, gold, platinum, diamond and legendary silhouettes with distinct materials and football motifs. Gold and higher ranks receive a restrained moving sheen, while reduced-motion preferences disable all continuous effects. The exact same full-detail vector crest is scaled in the profile, leaderboard, tooltips and level-up celebration rather than swapping to a simplified compact asset. After the first baseline visit, the browser remembers the latest seen level and celebrates a genuine increase with an accessible level-up card and reduced-motion fallback. The card remains open until dismissed and exports a branded PNG Story card with the shared level, progress and QR destination through the same native file-share/download fallback as the other share cards. Leaderboard ties keep unique positions and are ordered by points, exact scores, correct outcomes, fewer completed participation attempts in the selected league, then nickname. The public leaderboard exposes only aggregate playing statistics for its profile tooltip and never another player's individual picks.

Existing predictions and archived results are recalculated into points, exact scores, correct outcomes, streaks, completed participation and level whenever league state is built, so the progression system applies retroactively without a data migration. The two configured D.I.S host player IDs receive a public `isHost` marker used only for a verified-host badge and visual treatment; recovery hashes and player IDs remain absent from public responses. Recognized players can export a profile Story card containing their level, points, ranks and aggregate statistics.

The public league endpoint accepts a league ID and exposes only that league's standings and the current visitor's predictions. It also returns a small catalogue for switching leagues. It never exposes recovery hashes, player IDs, or another participant's score picks. Local data uses `data/prediction-league.json`; production uses the protected `predictionLeague` row in Supabase `app_state` through the existing storage abstraction.

Deleting a settled match or removing its league from the admin archives the result with its league ID instead of deleting its scoring history. The match disappears from the public page and admin editor, while earned points and statistics remain preserved. Deleting a match without a final result removes its unearned predictions.

Leagues and their trophies are managed from the Fan Zone admin page. Admins can create, select, hide or remove leagues and edit each league's own settings, matches and trophies. Trophy ownership is derived only from statistics in that league, so changing or deleting a trophy recalculates its awards without changing participant points.

Public forms write validated messages through `POST /api/messages`. The backend includes a honeypot and an in-memory per-IP rate limit. Reading, changing status, and deleting messages require an authenticated admin session.

After a message is saved successfully, production also sends a server-side email notification through Resend to the public contact address configured in admin. Local development never calls the email provider. Email delivery is secondary to inbox persistence: a provider error or timeout is logged with the internal message ID, but the visitor still receives a successful response because the message remains available in admin.

### Production Message Email Notifications

1. Create a Resend account for the D.I.S team and create a sending-only API key.
2. For the quickest single-recipient setup, the Resend account email and the public site contact email must be the same, then `D.I.S Podcast <onboarding@resend.dev>` can be used temporarily as `MESSAGE_EMAIL_FROM`. Resend restricts this testing sender to the account owner's address.
3. For the recommended long-term setup, add a domain or sending subdomain owned by D.I.S to Resend, publish the provided SPF and DKIM DNS records, wait for the domain to become verified, and use an address on that exact domain for `MESSAGE_EMAIL_FROM`.
4. In Render, configure `RESEND_API_KEY` and `MESSAGE_EMAIL_FROM`. Production startup intentionally fails if either value is missing, so a deployment cannot silently omit notifications.
5. Submit one message through each form type after deployment and confirm both the protected inbox record and the received email. Provider errors appear in Render logs under `[message-email]` with the internal message ID and no visitor details.

`MESSAGE_EMAIL_FROM` accepts either an address or a display name plus address, for example:

```env
RESEND_API_KEY=re_replace_with_real_key
MESSAGE_EMAIL_FROM="D.I.S Podcast <notifications@updates.your-domain.example>"
```

The notification recipient is not a separate secret setting. It follows the valid public contact email stored in editable site content, preferring `footer.email` (the address actually rendered by the shared frontend) and falling back to `sections.contact.email`. A missing or invalid address prevents only that notification and is reported in server logs; it never deletes or rejects the already persisted inbox message. When the visitor supplies a valid email, the notification uses it as `Reply-To`. The visitor is not emailed and there is no frontend, consent, or cookie change.

Notifications include the submitted form type, name, optional email/subject/company/budget, message, and submission time. User content is escaped in the HTML version, a plain-text version is also sent, requests time out after eight seconds, and the message ID is used as Resend's 24-hour idempotency key to protect against duplicate provider calls for the same saved record. Open and click tracking should remain disabled because these are internal transactional alerts.

Giveaway registration uses `POST /api/giveaway/entries`. An active campaign is visible only between its configured dates, appears as a featured live card on the homepage, and can be opened directly with `/fan-zone#giveaway`. The public `GET /api/giveaway/status` endpoint exposes only the number of eligible participants, never participant details. A signed browser cookie and normalized email prevent ordinary duplicate entries per campaign, while a per-IP rate limit slows automated abuse. These controls are appropriate for a community giveaway, but they are not identity verification.

The admin can make age, territory, and a social profile optional or required, copy the direct form link, attach a direct social-post link to each condition with `Condition text | https://...`, configure multiple prizes with quantities and optional images, stop registration, search or filter participants, exclude entries, export a UTF-8 CSV, and draw the resulting number of winners. The public view shows prize cards, a no-cache eligible-participant count, and a live day/hour/minute/second countdown when an end date exists. The public eligibility confirmation adapts to the configured age/territory and disappears when both are empty. Drawing uses Node's cryptographically secure random generator for both winner selection and independent prize assignment, stores each winner's rank, assigned prize, and draw time, and displays a compact rolling-name animation before the persisted result and celebration are revealed. The rolling names are presentation only and never determine the winner. Resetting winners is disabled until a result exists; resetting winners and deleting all entries are immediate actions protected by explicit destructive confirmation dialogs and do not require a separate page save. Existing results must be reset explicitly before another draw. Removing the giveaway deletes its participant data; disabling it only hides the public section and preserves entries.

## Admin Editing

Most public content is editable from the admin panel, including:

- brand name, logo, favicon, and hero background
- header navigation labels and links
- hero text, buttons, quick tags, and floating words
- social channels
- YouTube block
- formats
- sponsor packages
- active ads/campaigns
- statistics copy and numbers
- contact links
- contact email
- news page hero text/image
- direct news hero image upload from the News admin tab
- news posts with a stable detail URL, title, compact card/share excerpt, full article text, image, optional caption, and automatic local date
- page hero content and images for Fan Zone, Hosts, Partnerships, and Contact
- host profiles and optional profile photos
- host predictions
- fan polls, individual options, optional cached TheSportsDB logo/flag selection, status, deadline, and result visibility
- Prediction League catalogue and each league's title, season, manually managed or automatically imported TheSportsDB rounds, kickoff/status updates, team logos, derby flags, final scores and trophies
- giveaway title, multiple prizes, prize quantities/images, dates, eligibility, rules, privacy notice, image, and active state
- giveaway participant search/review, eligibility control, CSV export, secure winner/prize draw, and result reset
- inbox message statuses and deletion

The admin is organized into page tabs. Each editable page has its own Save control and an `Отмени промените` control. Restore discards only the unsaved draft for the current page and reloads that page from the last successful local-server or Supabase save; it does not publish or modify other page drafts.

Uploaded images that are deleted from admin are also removed from the local `uploads/` folder when they are no longer used by other content.
In production, the same cleanup removes unreferenced admin uploads from the Supabase `dis-media` bucket.
JPEG, PNG, and WebP uploads are automatically converted to optimized WebP when needed. Hero/background and brand-library images target a maximum 1920-pixel side and 1.2 MB; news, ad, and host images target 1600 pixels and 800 KB. The backend enforces a 1.2 MB stored-image limit, while video uploads retain the existing 25 MB request limit.
Each upload field displays its own loading spinner and progress message while optimization/upload is running, followed by a visible success summary or actionable error.

## Pages And Routes

- `/` - main website
- `/news` - news page
- `/news/:slug` - dedicated article page with full text, image, SEO metadata, and Story-image sharing
- `/fan-zone` - D.I.S Prediction Leagues, host predictions, polls, and fan idea form
- `/fan-zone#giveaway` - direct link to the active giveaway; hidden when no campaign is active
- `/hosts` - editable host profiles
- `/partners` - advertising formats, packages, active campaigns, and statistics
- `/contact` - adaptive general/idea/partner inquiry form
- `/privacy` - privacy policy and data-controller information
- `/cookies` - first-party cookie and external-content information
- `/login` - admin login
- `/admin` - admin panel after login

## SEO And Link Sharing

Every public page has its own search title, description, canonical production URL, Open Graph metadata, and large-image sharing preview for Facebook, Messenger, Viber, Discord, and other compatible apps. The homepage also includes Schema.org `Organization` and `WebSite` JSON-LD with the official brand name, logo, description, and social profiles.

Social metadata is included in the server's initial HTML response and does not depend on JavaScript. News detail pages receive their own article title, excerpt, canonical URL and uploaded image. Story images show the short `/news` address to avoid visual overlap, while their generated QR opens the exact article. Prediction-result and leaderboard Story images use `/fan-zone` both for the visible address and QR destination. The public `GET /api/share-qr?path=...` endpoint generates only allowlisted D.I.S destinations and cannot be used as a general external-URL QR service.

QR generation is server-side. After installing dependencies or updating this endpoint locally, fully stop and restart `npm start`; refreshing an older running process is not enough. The frontend refuses to download a QR-less Story card and shows a short reload/deploy message instead.

- `/sitemap.xml` is generated from the eight core public pages plus every current news detail URL.
- `robots.txt` links to the sitemap and prevents crawling of `/admin`, `/login`, and `/api/`.
- The canonical SEO origin is `https://dis-podcast.onrender.com`. Update every absolute SEO URL, the sitemap, and `robots.txt` before switching to a custom domain.
- Admin-edited page content remains dynamic, while the core search titles and social previews are intentionally present in the initial HTML so crawlers can read them immediately.

### Google Search Console

1. Deploy the SEO changes and confirm that `https://dis-podcast.onrender.com/sitemap.xml` opens.
2. Open Google Search Console and add a **URL-prefix** property for `https://dis-podcast.onrender.com/`.
3. The Search Console **HTML tag** verification token is configured in the homepage `<head>` and must remain there while the property is in use.
4. Complete verification, then submit `https://dis-podcast.onrender.com/sitemap.xml` under **Sitemaps**.
5. Use **URL inspection** to request indexing of the homepage and the most important public pages after major content updates.

Search Console access and verification require the owner's Google account, so this final registration step cannot be completed from the codebase alone.

## Free TheSportsDB Rounds, Results, And Team Logos

The football integration uses the public TheSportsDB V1 free key `123`; no account or API secret is required. The server calls `eventsround.php` for a configured league ID, season such as `2026-2027`, and round number. One response imports the complete round with stable event IDs, teams, badge URLs, UTC kickoff timestamps, statuses and available scores.

Each Prediction League stores a TheSportsDB league ID, season, current round, automatic-sync flag and a 1–14 day automatic import horizon. The admin button **Добави / обнови кръг N** explicitly imports the complete selected round even when it is outside the automatic horizon. Scheduled synchronization checks the current and next round once per day while the process is awake. When every event in the current round is final or cancelled, the stored round advances automatically.

The automatic-sync checkbox controls only background work. With it disabled, scheduled round and result requests stop completely, while the authenticated **Добави / обнови кръг N** button remains available when a valid league ID, season and round are saved. A manual request fetches only that selected round, updates its fixtures/results/logos and advances the stored current round if every event is complete.

Matches are upserted by TheSportsDB event ID. Existing API-Football-linked matches can migrate without duplication when TheSportsDB supplies its `idAPIfootball` cross-reference; otherwise a manual match with the same teams and a kickoff within six hours is linked. Later kickoff and status changes are applied unless an administrator locks the match details.

Result checks begin 100 minutes after kickoff and wait at least 25 minutes between attempts. The complete round is refreshed with one request. Only a valid `FT` score without extra-time score fields settles a match automatically. Extra-time, penalty, postponed, cancelled, incomplete and ambiguous results remain available for manual review. A manually edited result is permanently preferred over provider data.

Settled matches remain visible for 24 hours after the final result is recorded, then scheduled synchronization removes them from the active match list. The existing deletion archive preserves the match, result, predictions and earned points for scoring and leaderboards. Archived TheSportsDB event IDs are ignored by later round refreshes, so an automatically archived match cannot be added back.

Every imported event contributes its home and away team IDs, names and badge URLs to the protected team catalogue. `GET /api/team-media/search?q=...` checks that catalogue first, including transliterated Bulgarian queries. On a cache miss it uses the free `searchteams.php` name lookup, keeps only soccer teams and stores the returned badge for later searches. The free lookup normally returns one candidate, which the administrator must review and select. A repeated search uses the cache and consumes no provider request.

Usage timestamps and the team catalogue are stored under the protected `teamMediaCache` state. Local development uses ignored `data/team-media-cache.json`; production uses the existing Supabase `app_state` abstraction. The server enforces a conservative rolling limit of 20 requests per minute below TheSportsDB Free's published 30-request limit. The admin shows rolling usage and the number of requests made that day.

The Node process checks for due work on startup and every 30 minutes while it is awake; the 20-hour schedule timestamp prevents redundant round downloads. The GitHub Actions workflow `.github/workflows/football-sync.yml` also calls the protected synchronization endpoint at minutes 7 and 37 of every hour, waking a sleeping free Render service. Add a GitHub Actions repository secret named `FOOTBALL_SYNC_SECRET` with exactly the same value as the Render environment variable. Public page visits never call the sports-data API directly and read only saved content.

Public cards and share images use the stored badge URL with a text fallback. New badges load from `r2.thesportsdb.com`; legacy API-Football selections remain readable for backward compatibility. TheSportsDB is crowd-sourced and the `eventsround.php` endpoint is not included in its current main reference, so manual match creation, result correction and detail locking remain deliberate fallbacks.

### Configure a free league

1. Find the numeric league ID in the TheSportsDB league URL. Premier League is `4328`; Bulgarian First League is `4626`.
2. Open the protected Fan Zone editor, enable TheSportsDB automation for the D.I.S league, enter the league ID, a season such as `2026-2027`, and the current round.
3. Save Fan Zone, then press **Добави / обнови кръг N**. The same button later refreshes kickoff changes, statuses, final scores and badges.
4. `FOOTBALL_SYNC_SECRET` is optional for the admin button and in-process scheduler. Configure it only when an external scheduler must call the protected internal endpoint.

## Automated Football Newspaper

`NEWSDATA_API_KEY` enables the public `GET /api/press-news` endpoint and the compact **D.I.S Футболен вестник** section below the manually authored D.I.S posts. The API key is used only by the Node server and is never returned to browser JavaScript.

Each refresh makes one Bulgarian-priority search (clubs, the domestic league and the national team) and one general `футбол` search, both with `language=bg` and `category=sports`. Every response is filtered locally against football terms, clubs, players and competitions found in the title/keywords or strong entity matches in the description, so a broad sports classification alone cannot publish basketball, tennis or generic entertainment content. If both successful searches are empty, one broader Bulgarian sports request is made and filtered by the same rules. Only when all Bulgarian searches are empty, a final English `football` request supplies international headlines instead of leaving the section blank. The `БГ футбол` marker is based only on a real Bulgarian club, competition or national-team signal in the article text; the publisher being based in Bulgaria is not enough. The final page is always ordered by publication time with the newest headline first. NewsData returns at most ten results per request, and the section has a hard maximum of 20 displayed items.

While the service is awake, the server checks the feed once per hour but runs the two-query NewsData refresh at most once every 12 hours. A page request also triggers the same guarded check, and concurrent visitors share one in-flight refresh. Results use the existing persistence abstraction: ignored `data/press-news-cache.json` locally and the protected `pressNewsCache` value in Supabase `app_state` in production. Every successful refresh is deduplicated and merged with the previous collection; it does not erase still-current headlines. The cache keeps all valid unique results from the rolling 72-hour window and removes an article only after that age limit. At most 20 top-ranked items are returned to the page by default, so visitors see a compact selection even while the server retains the rest until expiry.

Only public metadata is retained: provider article ID, title, short description, original URL, source name/source URL, language, country, source-priority value and publication time. Full article bodies are never fetched or reproduced. When NewsData supplies a public article image URL, the server validates the host, limits the download to 5 MB, converts the image to a 480×270 WebP thumbnail and stores it in local uploads or the existing Supabase Storage bucket. The original image URL is not exposed to the visitor or retained in the article cache. Cached thumbnails are removed when no retained article references them after the 72-hour window. The browser loads only the cached D.I.S/Supabase copy and contacts the publisher only after choosing **Прочети в източника**.

To activate the feed, create a NewsData.io key, set `NEWSDATA_API_KEY` in Render (or the ignored local `.env`), and restart/redeploy the service. Without a key, manual D.I.S posts continue to work and the newspaper shows a neutral preparation message.

Google Search Console is used for indexing and search-performance reporting. This integration does not add a browser tracking script or a new site cookie, so it does not change the current Privacy or Cookie policy disclosures. Adding Google Analytics, Meta Pixel, advertising trackers, a new external embed, or any new form field requires a fresh review of both legal pages before deployment.

## Live Stats

Live stats are possible, but they need platform access:

- YouTube: YouTube Data API key can fetch channel/video statistics.
- Instagram: needs Meta app setup, Instagram professional account, permissions, and tokens.
- TikTok: public live stats are limited; official API access depends on app approval and available scopes.

The current admin is designed so those integrations can be added later without redesigning the website. For now, the public stats should show only verified facts from the known official links, not guessed follower/view numbers.

## Google Analytics 4

GA4 is integrated through the optional `GA_MEASUREMENT_ID` environment variable. Local development leaves it empty by default, so local visits never pollute production statistics. Production loads Google Analytics only after explicit visitor consent through the custom privacy panel.

- Consent defaults to denied for analytics, advertising storage, advertising user data, and advertising personalization.
- Choosing **Само необходими** does not load `gtag.js` or send analytics requests.
- Choosing **Приемам статистика** enables analytics storage and loads the configured GA4 stream; Google Signals and ad personalization remain disabled.
- The visitor can reopen the panel through **Настройки** in every public footer. Revoking consent removes accessible `_ga` cookies and reloads the page without Analytics.
- `dis_cookie_consent` stores the choice for up to one year. The public cookie and privacy policies describe GA4 and must be reviewed whenever its configuration or collected events change.
- In GA4, keep user/event data retention at **2 months** and do not link Google Ads without a new legal and consent review.

Production analytics uses the GA4 web data stream `G-G21K94TW2T` for `https://dis-podcast.onrender.com`. Render receives it through `GA_MEASUREMENT_ID`; local development leaves the variable empty so local visits do not affect production statistics. The Measurement ID is intentionally not stored in editable website content.

## Privacy And Legal Operations

- Ivan Stefanov and Danail Danev are identified publicly as the people responsible for D.I.S Podcast data processing.
- The footer copyright notice and legal links are rendered on every public page.
- Contact, fan-idea, and giveaway forms show a short privacy notice beside the submit flow.
- Production general questions, fan ideas, and partnership messages are forwarded server-to-server through Resend as an internal notification after they are saved; Resend does not add browser cookies or contact the visitor directly.
- Every giveaway has its own admin-editable official rules, privacy notice, platform disclaimer, dates, eligibility, and prizes. The public form links directly to the rules for the active campaign.
- `dis_session` is created only after admin login, `dis_voter` only after voting or reacting, `dis_league` only after Prediction League registration or recovery, and `dis_giveaway` only after successful giveaway registration.
- Google Analytics 4 is optional and loads only after explicit analytics consent; Meta Pixel and advertising-profile trackers are not used.
- The YouTube iframe intentionally loads immediately on the homepage. This preserves the direct player experience but means the browser connects to YouTube/Google on page load; the Cookie and Privacy policies disclose this behavior.
- Google Fonts is also loaded from Google and is disclosed as an external service.
- TheSportsDB round/result synchronization and cache-miss logo lookup are server-to-server. Logo search reads the protected imported-team catalogue first and caches a free name lookup when necessary. New public logos load from `r2.thesportsdb.com`; the Privacy and Cookie policies disclose the resulting technical request, protected cache/content storage, lack of a new D.I.S cookie, and third-party trademark responsibility.
- Treat `README.md`, `/privacy`, and `/cookies` as part of every feature change: update the relevant documentation and displayed last-updated date whenever data collection, cookies, retention, external providers, tracking, user forms, or campaign rules change.

Operational responsibility remains with the administrators: resolve and remove inbox messages when no longer needed, normally within 12 months, and remove giveaway participant data after the campaign, prize delivery, and any short complaint period, normally within 90 days. Before using uploaded media publicly, confirm that D.I.S has permission to use the image, logo, person, music, video, or sponsor material. AI generation alone does not guarantee rights over real people, club marks, or third-party brands.

The policy text is a practical transparency baseline and not a substitute for advice from a Bulgarian lawyer when running paid campaigns, larger giveaways, or processing more sensitive data.

## Recommended Next Steps

1. Replace placeholder copy with their real tone and inside jokes.
2. Paste a concrete YouTube video URL in admin so the player embeds the latest video.
3. Add real host names, biographies, football favorites, and optional profile photos.
4. Replace the placeholder contact email and example poll/prediction.
5. Add basic analytics after deployment.
6. Deploy to a Node-compatible host with persistent storage.

## GitHub And Deployment Preparation

- `.env` and all environment-specific secret files are ignored by Git.
- Runtime inbox messages, vote records, Prediction League participants/predictions, and uploaded files are ignored by Git.
- Production requires explicit `ADMIN_PASSWORD` and `SESSION_SECRET` environment variables.
- Production requires `RESEND_API_KEY` and `MESSAGE_EMAIL_FROM`; local development does not send message emails even if they exist in `.env`.
- TheSportsDB Free requires no environment API key. Without a configured league, manual matches and existing team media continue to work; the logo picker searches whatever teams have already been cached from imported rounds.
- `NEWSDATA_API_KEY` is optional. Without it, manual D.I.S news remains available and no third-party news request is made. With it, the public newspaper uses the bounded server-side cache described above.
- `GET /health` is available for hosting health checks.
- Do not commit real inbox messages, voter identifiers, passwords, or API keys.

The current local JSON and upload storage remains suitable for development only. A free host such as Render uses an ephemeral filesystem, so production deployment must move editable content, messages, votes, and uploaded media to persistent external storage before the admin panel is used publicly. The planned setup is Supabase for structured data and Supabase Storage or Cloudinary for uploaded media.

### Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql` once.
3. Copy the Project URL and service-role key into the hosting environment variables shown in `.env.example`.
4. Never expose `SUPABASE_SECRET_KEY` in frontend code or commit it to Git.

When all Supabase variables are present, the Node backend automatically stores content, inbox messages, votes, Prediction League data, and uploaded media in Supabase. Without them, local development continues to use `data/*.json` and `uploads/`. Production startup intentionally fails when Supabase is missing, preventing accidental data loss on an ephemeral host.

Production giveaway participants are stored in the protected Supabase `app_state` row whose key is `giveawayEntries`. Local development uses the ignored `data/giveaway-entries.json` file, so local tests do not touch production unless `USE_SUPABASE_LOCAL=true` is set intentionally. No additional Supabase table or migration is required.

Prediction League participants and predictions use the same protected `app_state` table under the `predictionLeague` key. Existing single-league content is migrated in memory to the `general` league, while new predictions include a league ID, so no additional Supabase migration is required.

Local development uses JSON files and the local `uploads/` directory even when Supabase credentials exist in `.env`. Set `USE_SUPABASE_LOCAL=true` only when intentionally testing against the production Supabase project. Render uses Supabase automatically because `NODE_ENV=production`.

Admin saves never silently fall back to browser-only persistence. If the local backend or Supabase save fails, the draft remains visible in the editor and the admin reports an error; the last saved version remains unchanged and can still be restored.

### Render Deployment

The repository includes `render.yaml` for a free Node web service in Frankfurt. Create a new Render Blueprint from the GitHub repository and provide `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `MESSAGE_EMAIL_FROM`, and the optional `NEWSDATA_API_KEY` when prompted. Render generates `SESSION_SECRET` automatically and uses `/health` for health checks.

Large visual assets are delivered as WebP and image assets include browser cache headers to reduce Render outbound bandwidth. CSS and JavaScript always revalidate so a deployment cannot mix incompatible cached frontend versions. The original PNG files remain source assets and are not used by normal public page loads.

### Browser Support

The interface targets current Chrome, Edge, Firefox, and Safari releases on Windows, macOS, iOS, and Android. CSS includes viewport, WebKit blur/mask, scrollbar, and color fallbacks where appropriate. Public pages, admin, and login use the same Inter font to keep layout metrics consistent across operating systems. Internet Explorer is not supported.

## Architecture Recommendation

The current plain HTML/CSS/JS frontend plus small Node.js backend is still a good fit. A framework like Vue or React becomes useful only if the site grows into a larger dashboard, multi-user CMS, automated feeds, or richer campaign reporting.

## Current Project State

The site has a small Node.js backend, a protected admin panel, editable content in `data/content.json`, upload support, and public pages focused on:

- official D.I.S Подкаст social channels
- hero presentation with editable brand/logo/background
- animated active ads below hero sections
- latest YouTube video block
- content formats
- sponsor and advertising packages
- active ads/campaign uploads
- manual news posts
- automatically refreshed, Bulgarian-first world-football newspaper cards below the manual D.I.S posts
- host profiles and optional photos
- host predictions and fan voting
- optional giveaway registration, homepage live feature, countdown, public participant count, and admin winner/prize drawing
- fan/general/partner forms with protected inbox and production email notifications
- honest partner-facing statistics
- contact buttons
- shared footer with email/social links
- football-themed scroll progress indicator on desktop and mobile
- subtle clipped hero parallax and a themed native scrollbar
- playful football ornament layer across buttons, cards, hero, YouTube, and section labels

Run locally with:

```bash
npm start
```

Public site:

```text
http://127.0.0.1:4177/
```

Admin login:

```text
http://127.0.0.1:4177/login
```

Use `.env` for local secrets:

```bash
ADMIN_PASSWORD="choose-a-strong-password"
SESSION_SECRET="choose-a-long-random-secret"
```

## Current Direction

The best professional direction is to keep this as a fast official brand page and partner page, not a complex social network or full CMS. The site should help D.I.S Подкаст look serious to viewers and future sponsors while staying easy for the creators to update.

Recommended next steps:

1. Add YouTube Data API integration for real subscriber/video statistics.
2. Add privacy-conscious traffic analytics.
3. Add a real sponsor contact email when the brand is ready.
4. Keep Instagram/TikTok/Facebook stats manual until official API access is available.
