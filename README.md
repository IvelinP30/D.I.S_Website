# D.I.S Подкаст Website

Modern public website and admin panel for D.I.S Подкаст, a football-focused podcast and social media brand.

Live site: https://dis-podcast.onrender.com

## What It Is

- Public brand website for Instagram/TikTok/YouTube/Facebook
- Separate news page with manually managed posts
- Separate Fan Zone, Hosts, Partnerships, and Contact pages
- Fan voting with host predictions, animated results, and one signed visitor vote per poll
- Contact and fan-idea forms stored in a protected admin inbox
- Presents the channel as a football media brand
- Includes sponsor packages and active ad placements
- Shows active ads in a horizontal marquee below page hero sections
- Uses full-viewport hero sections on every public page, with ads beginning after the first viewport
- Uses restrained hero image/text entrance transitions instead of heavy page-to-page animations
- Adds playful football UI details: field-line ornaments, live dots, button motion, and subtle card animations
- Uses a restrained set of generated transparent football stickers between channels and YouTube, beside formats, and around the advertising menu
- Adds brighter CTA motion and matching interactive effects across header and footer controls
- Includes a shared footer on public pages with brand links, social links, and email contact
- Includes a YouTube player block controlled from admin
- Includes a password-protected admin panel
- Stores editable content in `data/content.json`, votes in `data/votes.json`, and inbox messages in `data/messages.json`
- Supports uploads for logo, hero backgrounds, ad media, and news images
- Uses a generated football podcast hero image in `assets/hero-football-podcast.png`
- Uses the D.I.S logo in `assets/dis-logo.png` as the navbar mark and favicon
- Uses generated football visuals for the news hero and scroll progress indicator

## How To Preview

From this folder:

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4177/
http://127.0.0.1:4177/news
http://127.0.0.1:4177/fan-zone
http://127.0.0.1:4177/hosts
http://127.0.0.1:4177/partners
http://127.0.0.1:4177/contact
http://127.0.0.1:4177/login
```

## Protected Admin

Create a local `.env` file:

```bash
ADMIN_PASSWORD="choose-a-strong-password"
SESSION_SECRET="choose-a-long-random-secret"
```

Then run:

```bash
npm start
```

The public site reads content from `GET /api/content`.
The admin saves content with `PUT /api/content`, protected by a signed session cookie.

Voting uses a long-lived signed `dis_voter` cookie. It prevents normal repeat voting per poll without requiring accounts. Clearing cookies or deliberately changing identity can bypass this, which is acceptable for the intended entertainment use.

Each visitor can vote once in every separate poll. Deleting a poll from admin also removes its stored vote records on the next content save.

Public forms write validated messages through `POST /api/messages`. The backend includes a honeypot and an in-memory per-IP rate limit. Reading, changing status, and deleting messages require an authenticated admin session.

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
- news posts with title, text, image, and automatic local date
- page hero content and images for Fan Zone, Hosts, Partnerships, and Contact
- host profiles and optional profile photos
- host predictions
- fan polls, options, status, deadline, and result visibility
- inbox message statuses and deletion

The admin is organized into page tabs. Each editable page has its own Save control and an `Отмени промените` control. Restore discards only the unsaved draft for the current page and reloads that page from the last successful local-server or Supabase save; it does not publish or modify other page drafts.

Uploaded images that are deleted from admin are also removed from the local `uploads/` folder when they are no longer used by other content.
In production, the same cleanup removes unreferenced admin uploads from the Supabase `dis-media` bucket.
JPEG, PNG, and WebP uploads are automatically converted to optimized WebP when needed. Hero/background and brand-library images target a maximum 1920-pixel side and 1.2 MB; news, ad, and host images target 1600 pixels and 800 KB. The backend enforces a 1.2 MB stored-image limit, while video uploads retain the existing 25 MB request limit.
Each upload field displays its own loading spinner and progress message while optimization/upload is running, followed by a visible success summary or actionable error.

## Pages And Routes

- `/` - main website
- `/news` - news page
- `/fan-zone` - host predictions, polls, and fan idea form
- `/hosts` - editable host profiles
- `/partners` - advertising formats, packages, active campaigns, and statistics
- `/contact` - adaptive general/idea/partner inquiry form
- `/login` - admin login
- `/admin` - admin panel after login

## Live Stats

Live stats are possible, but they need platform access:

- YouTube: YouTube Data API key can fetch channel/video statistics.
- Instagram: needs Meta app setup, Instagram professional account, permissions, and tokens.
- TikTok: public live stats are limited; official API access depends on app approval and available scopes.

The current admin is designed so those integrations can be added later without redesigning the website. For now, the public stats should show only verified facts from the known official links, not guessed follower/view numbers.

## Recommended Next Steps

1. Replace placeholder copy with their real tone and inside jokes.
2. Paste a concrete YouTube video URL in admin so the player embeds the latest video.
3. Add real host names, biographies, football favorites, and optional profile photos.
4. Replace the placeholder contact email and example poll/prediction.
5. Add basic analytics after deployment.
6. Deploy to a Node-compatible host with persistent storage.

## GitHub And Deployment Preparation

- `.env` and all environment-specific secret files are ignored by Git.
- Runtime inbox messages, vote records, and uploaded files are ignored by Git.
- Production requires explicit `ADMIN_PASSWORD` and `SESSION_SECRET` environment variables.
- `GET /health` is available for hosting health checks.
- Do not commit real inbox messages, voter identifiers, passwords, or API keys.

The current local JSON and upload storage remains suitable for development only. A free host such as Render uses an ephemeral filesystem, so production deployment must move editable content, messages, votes, and uploaded media to persistent external storage before the admin panel is used publicly. The planned setup is Supabase for structured data and Supabase Storage or Cloudinary for uploaded media.

### Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql` once.
3. Copy the Project URL and service-role key into the hosting environment variables shown in `.env.example`.
4. Never expose `SUPABASE_SECRET_KEY` in frontend code or commit it to Git.

When all Supabase variables are present, the Node backend automatically stores content, inbox messages, votes, and uploaded media in Supabase. Without them, local development continues to use `data/*.json` and `uploads/`. Production startup intentionally fails when Supabase is missing, preventing accidental data loss on an ephemeral host.

Local development uses JSON files and the local `uploads/` directory even when Supabase credentials exist in `.env`. Set `USE_SUPABASE_LOCAL=true` only when intentionally testing against the production Supabase project. Render uses Supabase automatically because `NODE_ENV=production`.

Admin saves never silently fall back to browser-only persistence. If the local backend or Supabase save fails, the draft remains visible in the editor and the admin reports an error; the last saved version remains unchanged and can still be restored.

### Render Deployment

The repository includes `render.yaml` for a free Node web service in Frankfurt. Create a new Render Blueprint from the GitHub repository and provide `ADMIN_PASSWORD`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY` when prompted. Render generates `SESSION_SECRET` automatically and uses `/health` for health checks.

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
- host profiles and optional photos
- host predictions and fan voting
- fan/general/partner forms with protected inbox
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
