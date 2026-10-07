# Encore — Artist Tracking and Fan Assistant

## Catalog Expanded to 100 Profiles — 8 Oct 2026 (B.E. 2569)

Added **50 profiles and 50 officially verified Instagram handles through the existing admin API**, bringing the live catalog to 100: new entries are 30 solo artists, 15 groups/duos and five LYKN members. Verification uses individual LOVEiS/GMMTV pages and the What The Duck official roster; every new detail page exposes its Instagram and a saved source. All 50 earlier core profiles/biographies are preserved. New biographies, licensed portraits, genre and popularity audits remain pending; no invented content or image reuse was added. [Profile list, sources and evidence](docs/artist-expansion-100-2026-10-08.md)

At **05:37 Thai time**, normal scheduling had successfully checked **3/50 new accounts**; news increased 1,313 → 1373. Latest headers: call 23% / time 58% / CPU 0%, no active pause, fresh 50/100. Official handle verification does not guarantee Business Discovery access. The unchanged 60-second account spacing means a full 100-account pass takes at least 100 minutes before cooldowns; the 60-minute eligibility interval does not promise all-account hourly freshness. No manual Graph calls or backfill were run.

No service restart/configuration/schema change was required. Worker boot, both monitoring windows and all **93 existing hourly reservations** were verified unchanged; window 2 still ends **12 Oct 06:00** and remains collecting. The next concert cycle and repeated 100-account usage still need observation because artist-based foreign searches now have more rows. Fifty biographies enter the existing 23:00–00:00 schedule with a maximum ten attempts/night, without guaranteeing ten successful publications. All 50 new profile APIs, five public pages, and Chrome search/profile/admin/mobile checks passed; screenshot review found no overflow/page errors. Earlier test counts remain historical; no full suite was rerun for this data-only change.

## More Diverse For You Feed — 8 Oct 2026 (B.E. 2569)

For You now combines follows, artists in recent tagged fan posts you wrote/liked/commented on, direct band/member relationships, normalized genres, shared-interest fan authors, freshness and a small bounded engagement bonus. It reranks metadata to reduce repetition: when alternatives exist, each 15-item page allows up to three posts per artist, two per fan author, five per band family, and one copy of an identical normalized caption of at least 80 characters. It avoids adjacent repeated artists/authors and provides three opportunities each for relevant fan posts and fresh unfamiliar artists. These are opportunities, not guaranteed quotas; sparse catalogs relax limits and older posts remain browsable.

Viewer-bound ordering snapshots keep forward/back pagination stable for up to ten minutes, while visibility, content and reaction counts are read live. Refreshing the feed, following an artist or publishing a post starts a new ordering. Expired/evicted windows return to page one with a notice. Following remains chronological and restricted to followed artists. No new key, migration, external API or GPU request is needed.

Focused ranking/HTTP tests passed 19 cases, and six actual Chrome scenarios passed in a 1,242-entry isolated catalog: ten artists/six fan posts in its first page, 416 ms for one initial API request, stable pagination, reset/refresh, account switching and mobile 390px. Read-only live comparison at **04:59 Thai time** increased guest first-page artist diversity from **8 to 14**, reducing the largest artist group from **5 to 1**; no live fixture content was added. Recommendation satisfaction and higher-load performance still require UAT. [Algorithm, measurements and limitations](docs/feed-diversity-acceptance-2026-10-08.md)

Typecheck/production builds and **247 server tests (zero failures/skipped)** passed. API/web are deployed; four read-only production checks passed at **05:03 Thai time**, including Chrome pagination, refresh, mobile and `/news`. The worker boot remains 8 Oct at 04:24:18, and the original monitoring window still ends 12 Oct at 06:00. Update with `docker compose up -d --build --no-deps api web`.

## Images for Every Stored Concert — 8 Oct 2026 (B.E. 2569)

Concert detail pages display the complete event image on desktop/mobile, with a full-size link and its actual source. This applies to every provider. Other providers load directly from their CDN; ThaiTicketMajor images use `/api/concerts/:slug/image` because Chrome could not decode 46 direct URLs. The relay reads only saved HTTPS TTM poster paths, validates redirects/file signatures, limits responses to 8 MiB/15 seconds, and keeps no image files on disk or in PostgreSQL. Concert cards use the same image selection. Missing/failed images retain usable details and a source link.

At **04:21 Thai time**, all **385/385 stored concerts** have an image URL and source, up from 375: Eventpop 41/41, ThaiTicketMajor 50/50, The Concert 34/34, Ticketmelon 240/240, Ticketmaster 16/16, and Live Nation Tero 18/18. Source totals overlap because some events have multiple sources. Six Eventpop images came from real poster markup instead of placeholder metadata; four Ticketmaster events use matching UOB LIVE/Live Nation event images. Two are artist cover photos, so the caption says event image rather than claiming every image is a poster. Missing future artwork is never invented.

Migration `024_concert_image_sources.sql` retains image source/check time separately from concert verification. Ingestion preserves an existing image when a later response has none. Update API/web/worker with `docker compose up -d --build --no-deps api web worker`. The worker was updated while idle at **04:24:18 Thai time**; all 92 stored hourly reservations and both monitoring windows were verified unchanged, including window 2 ending **12 Oct at 06:00**. No new key or environment setting is needed.

The original Mingle Festival image (1174×1658), mobile 390px, missing-image layout, and simulated image failure passed four Chrome checks at 04:06. After final API/web deployment, **385/385 images decoded in Chrome at 04:32:52**, with zero image failures. Seventeen detail-page checks covering every stored provider passed, including source links/reviews, mobile 390px, and relay guards. Typecheck/build and the final **238 server tests (zero failures/skipped)** passed; [concert image report](docs/concert-images-acceptance-2026-10-08.md). Remote image availability can change; image coverage does not establish complete concert discovery or finish the seven-day/UAT/VPS checks.

## Improved Artist Suggestions — 8 Oct 2026 (B.E. 2569)

The feed sidebar combines followed artists, normalized genre similarity, direct band/member relationships, finished concert attendance, and visible tagged posts/likes/comments. Aggregate co-follow recommendations require at least three supporting users. Already-followed artists are excluded; selection reduces repeated genres/band families and displays up to two actual reasons. Guests use stored popularity as a fallback. No Ollama/Graph request, new key, or migration is required. Likes use the post's date for the 90-day window because like timestamps are not stored.

Typecheck, server/Next builds, **231 server tests (zero skipped)**, and three actual Chrome scenarios passed. API-only deployment and read-only live checks passed on 8 Oct at **03:59 Thai time**; 50 artists remain with no recommendation fixtures. The original worker and window 2 ending 12 Oct at 06:00 are unchanged. Tests verify behavior and account separation; recommendation quality still needs real-user feedback. API-only update: `docker compose up -d --build --no-deps api`. [Algorithm, evidence, and limitations](docs/artist-suggestions-acceptance-2026-10-08.md)

## Community Feed and Concert Reviews — 8 Oct 2026 (B.E. 2569)

Home (`/`) and `/news` provide **For You** and **Following** feeds. Following includes news and fan posts tagged with your followed artists; For You prioritizes those artists, shared-interest fan authors, genres, and your own posts, while keeping all visible content browsable. Upcoming/current concerts appear on the left and unfollowed artist suggestions on the right; mobile stacks these sections below the feed. Older stored news remains accessible by pagination. Feed browsing uses stored data and makes no Instagram Graph requests.

Signed-in users can post text, upload images/videos, tag up to five artists, like, comment, and edit/delete their own content. A post allows four files: JPG/PNG/WebP up to 6 MiB each, MP4/WebM up to 25 MiB. Uploads require a rights confirmation and stay in PostgreSQL for persistence/backup; Instagram media remains remote. Limits are 100 MiB per user over 24 hours, 12 unattached drafts, and 30 feed mutations/minute. Videos support range requests; no transcoding is added, so browser codec support matters. Fan posts are labeled and are not AI factual sources.

Concert detail pages show 1–5 star reviews and the mean of visible reviews. Writing requires login, recorded attendance, and a finished concert including all current performances. Unknown end times wait until the next Thai calendar day; postponed/cancelled events stay closed. One review per user can be edited/deleted; removing attendance also removes it. Admin can hide/restore fan posts, comments, and reviews from **Community / Reviews** at `/admin`.

Migration `023_community_feed.sql` runs at API startup; no new key/dependency/environment setting is needed. Update API/web with `docker compose up -d --build --no-deps api web`, preserving the worker and existing seven-day window. Typecheck/build passed; focused HTTP/PG tests passed 10 and the full server suite passed 222/0 skipped. Eight actual Chrome workflows passed in an isolated database, including PNG/WebM playback, an 11 MiB proxy upload, feed filtering, review editing, session separation, and admin moderation. Test files now run sequentially to prevent shared PostgreSQL advisory locks interfering between isolated schemas; concurrency scenarios inside files still run concurrently. [Behavior, evidence, and limitations](docs/community-feed-acceptance-2026-10-08.md)

**Local deployment verified on 8 Oct at 03:31 Thai time:** API/web and migration 023 are active. Read-only Chrome/API checks passed on home, news, and concert reviews, including mobile. The live database contains 50 artists, 385 concerts, and 1,313 news posts, with no fixture posts/uploads/reviews. The original worker and window 2 ending 12 Oct at 06:00 remain unchanged. Real-user UAT, sustained upload/codec testing, and VPS storage/backup/HTTPS checks remain pending.

## New Artist Workflow Testing — 7 Oct 2026 (B.E. 2569)

Added `apps/server/src/new-artist-flow.test.ts` for administrator creation → account verification → nightly biography/source publication → news ingestion → three simultaneous users chatting during background AI. The focused workflow passed 8 tests including its parent; all 212 server tests passed with 0 skipped, and typecheck/production builds passed. Model/Graph responses and time are fixtures in this reproducible regression. [Detailed evidence and limitations](docs/new-artist-flow-acceptance-2026-10-07.md)

The actual nightly worker, native Ollama, and Chrome admin flow passed in an isolated database on 7 Oct: Tilly Birds was created from a name/social link; the 27B biography started at 23:00:52 Thai time and published 3 sourced sections at 23:03:32. Three simultaneous users received HTTP 200 in 4.190–5.758 seconds with separate recommendations; the shared GPU queue preempted biography once and resumed it. The normal Instagram slot at 23:05 returned 20 posts in 2 Graph requests; replay imported those real responses into the isolated profile and news chat cited existing posts without more Meta calls or history pagination. Chrome desktop/mobile source rendering passed. The live catalog remained at 50 artists, and the original worker and concert monitoring window were preserved.

**Editorial check remains open:** the generated biography repeated an album year from the Wikipedia introduction that conflicts with details in the same article. Sources and the unreviewed AI label are visible; source grounding does not guarantee source accuracy. This isolated biography was not imported into the live catalog. One night/three users does not establish repeated-night or high-load acceptance.

Fixed missing AI citations for administrator-created concerts: recommendations and concert answers use the saved `official_url` when an ingestion source URL is absent. API-only deployment needs `docker compose up -d --build --no-deps api`; no migration/new key is required. The existing concert/news worker and seven-day window remain in place. Run the focused regression with `node --import tsx --test apps/server/src/new-artist-flow.test.ts` after configuring an isolated `INGEST_TEST_DATABASE_URL`.

## Current Priorities — 7 Oct 2026 (B.E. 2569)

The local concert report generated at 22:08 Thai time records 64/168 complete hours and 256/256 source requests, with 0 unfinished/missing/late checks and 72 source-result issues. Both verdicts remain collecting until the existing window ends on 12 Oct at 06:00. Scheduled coverage still needs review: ThaiTicketMajor has 43 inaccessible details; Eventpop/The Concert have 20/2 empty pages; Ticketmelon has 1 failed and 1 pending URL. These measurements come from `.local/concert-reports/concert-monitor-latest.md`, not new provider requests.

Next work: obtain actual automatically discovered X/Facebook posts (at least one per platform under available permissions); review the biography source conflict found in tonight's new-artist test, then extend its successful actual 23:00–00:00/Instagram/three-user workflow to additional profiles, nights, and user load; continue the original concert window and review incomplete coverage. Complete image-rights evidence for MILLI/Only Monday and outstanding membership/affiliation issues, then apply Figma when received on 15 Oct. Full UAT with 15–20 people and VPS/VPN/HTTPS/backup-restoration acceptance remain pending. Search links/manual trip prices are implemented; automatic live prices remain optional.

This update records priorities and existing report evidence only; it does not close acceptance criteria or change running services.

**Latest admin management update, 6 Oct 2026 (B.E. 2569), 20:22:** `/admin` brings together artists, concerts, news, and users. Create artists with names and social links, automatic slugs, and duplicate checks; edit accounts, members, biography sources, and use the existing biography/image editor. All 204 server tests passed with 0 skipped, and 7 Chrome scenarios passed. An admin account was created from `.env`; actual login, Chrome, and API checks passed. The live database still contains 50 artists, 377 events, and 1,223 news posts; the existing worker and monitoring window 2, ending 12 Oct at 06:00, remain in place. [Instructions and evidence](docs/admin-management-acceptance-2026-10-06.md)

## Website Administration

Sign in at `/account`, then open [Admin management](http://localhost:3000/admin), or use the link on the administrator's account page.

- **Artists:** Enter a name, optionally choose a type, and add multiple Instagram/Facebook/X/YouTube/TikTok/website links. No slug is required. Creation rejects duplicate names or accounts belonging to another profile; a name alone is accepted if links are not yet available. The system does not invent biographies, images, or popularity evidence.
- Confirm an official account only after checking it. Pending accounts are visible in admin; confirmed accounts appear on profiles and enter the existing news schedule where supported. YouTube/TikTok are channel links; no post collectors were added. Instagram keeps its existing cadence, cooldown, and usage budget. Creating a profile makes no API call.
- Search artists to edit type, English name, genres, social accounts/account IDs, band members, references, biographies, and credited images. Seed/audit will not restore accounts, memberships, or source lists changed by an administrator. Removing a source does not remove references in existing biography sections. Profiles without biography sections or a manual biography lock still enter the existing 23:00–00:00 AI queue; publication depends on readable evidence.
- **Concerts:** Search past events too; add/edit details, leave unknown prices blank, choose currencies, link artists, and add/edit performances. Enter times in Thai local time. Clear a performance's current flag to retain it as history. Manual edits are protected from ingestion; conflicting edits return 409 with an option to reload.
- **News:** Search, hide, or restore news while retaining original posts and media URLs. Repeated ingestion does not restore hidden posts; the public feed and AI news search exclude them.
- **Users:** Search accounts, change roles, and revoke sessions on all devices. Role changes require a new login. You cannot change the role of the account currently in use; passwords and session tokens are not displayed.

Migration `022_admin_management.sql` runs automatically when the API starts. No external service keys were added. Update with `docker compose up -d --build --no-deps api web`; this update did not restart the worker or reset the seven-day window. Run seed with `docker compose run --rm --build seed` to use the latest protection against restoring manually changed data.

**Administrator account:** Created using `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env`, with an actual successful login verified on 6 Oct at 20:22. Sign in at `/account` using those settings. On a new machine, set both values with a password of at least 12 characters, then run `docker compose run --rm --build seed`. Seed validates settings before modifying the database; an existing user email is not automatically promoted. Do not send passwords in chat or commit `.env`.

Check code with `npm run typecheck`, `npm test`, and `npm run build`. Integration tests require `INGEST_TEST_DATABASE_URL` pointing to an isolated `encore_ingest_test...` database and `BIOGRAPHY_TEST_DATABASE_URL` pointing to `encore_biography_test...`. Run management tests alone with `node --import tsx --test apps/server/src/admin-management.test.ts`. Results and remaining work are in the report above.

**Latest concert update, 6 Oct 2026 (B.E. 2569), 19:33:** All 4 catalogs were checked: TTM 47 / Eventpop 58 / The Concert 36 / Ticketmelon 552 URLs. Two Ticketmelon source identities added one new event and one source to an existing event, for 377 events total. Recent Ticketmelon priority was fixed; TTM listing data now supplements partial records without overwriting existing details. `/status` provides coverage by URL and CSV, separating automatic and manual checks. Existing window 2 remains at 148/148 checks, cadenceIssues 0, collecting until 12 Oct at 06:00. AccessVerification still blocks 43 TTM detail pages, so coverage remains partial. [Results and limitations](docs/concert-coverage-acceptance-2026-10-06.md)

**Latest artist editor update, 6 Oct 2026 (B.E. 2569), 03:17:** `/admin/edit` now supports short biographies, sourced biography sections, and profile images, with uploads or URLs and image credits. Seed/audit/AI cannot overwrite manual changes. All 177 server tests passed with 0 skipped, and 6 Chrome scenarios passed. The live database still has 50 profiles, 161 sections, and 48 credited images. [Acceptance report](docs/admin-artist-editor-acceptance-2026-10-06.md)

**Latest data/UI update, 5 Oct 2026 (B.E. 2569), 22:00:** The live database has 50 profiles and 161 sections. Seven credited images were added, bringing coverage to 48/50; MILLI/Only Monday still await permission. Membership/affiliation evidence was added for 17 profiles; public evidence resolved 4 outstanding limitations, with 24 profiles still requiring further review. All 164 server tests and the final 4 artist tests passed. Chrome checks of new images, credits, and a 390px mobile viewport passed. Figma preparation for 15 Oct includes a shared portrait component, loading/error/rights states, keyboard focus, and design tokens; the actual design has not arrived. See `docs/data-ui-acceptance-2026-10-05.md` and the handoff checklist `docs/figma-handoff-2026-10-15.md`.

**Latest authorization update, 5 Oct 2026 (B.E. 2569):** All 32 method/path variants were checked; 45 HTTP/PostgreSQL tests and the full 164 server tests passed, with 0 skipped. Fixes cover private caching, malformed cookies, session expiry during AI/trip calculations, and stale data across accounts/tabs. Nine Chrome scenarios passed. See `docs/authorization-acceptance-2026-10-05.md`. The new API/web version is running; UAT and HTTPS/proxy checks on a real VPS remain pending.


A Next.js website, Express API/worker, PostgreSQL + pgvector, and Ollama for tracking artists, concerts, news, and trip budgets.

**Latest trip budget update, 5 Oct 2026 (B.E. 2569):** Search links and user-selected prices are the core scope. Helpers for pasted text and saved private budgets are implemented; no price API key is required. Automatic live prices are optional. Instructions and results appear near the end of this document.

**Latest GPU queue update, 5 Oct 2026 (B.E. 2569):** Chat takes priority over biographies/news/embedding. Background work pauses and resumes the same step after 15 seconds without chat activity. Seven chat questions returned 200 while a real 27B biography job ran (slowest: 25.529s); four biography sections were published in an isolated database. The live website database remained at 50 profiles/160 sections. See `docs/gpu-queue-acceptance-2026-10-05.md`. UAT, multiple-user load, and a full night of scheduling remain pending.

**Travel source update, 5 Oct 2026 (B.E. 2569):** Use Agoda for accommodation, Traveloka for flight searches, BusOnlineTicket for coaches, and SRT D-Ticket for trains. Amadeus Self-Service integration was retired and 12Go removed as requested. Live-price API access for the new providers is not yet available. Mock test results are not actual booking quotes; see below and `docs/acceptance.md`.

Project source: [Encore-project](https://github.com/kengkak7744/Encore-project).

The active directory is `D:\senior project`; the old directory on `C:` remains unchanged. Chat and news summaries use `qwen3:8b`, and document retrieval uses `qwen3-embedding:0.6b`. Automatic biographies use `encore-biography:qwen3.8-27b` (Qwen3.8 27B UD-IQ4_XS), calling the user's Ollama directly on this machine through port 11434 and using its GPU. Initial biographies for 50 profiles were researched and written from cited sources before import; AI additions carry a clear label.

## Local Setup

Requires Node.js 24+, Docker Desktop, and Ollama.

```powershell
npm ci
ollama pull qwen3:8b
ollama pull qwen3-embedding:0.6b
npm run biography:setup
docker compose up -d --build
```

Open <http://localhost:3000> and view status at <http://localhost:3000/status>. Compose starts seed and adds 50 profiles (43 artists/bands + 7 individual 4EVE members), with short biographies, biography sections, and references. The profile verification mark means **biography information** has supporting sources; it does not mean every social account is verified. For an existing database, run `docker compose run --rm --build seed` to add missing sections without overwriting administrator edits. The worker checks concerts immediately, then uses clock-aligned hourly checks recorded in the database; news follows its configured interval while containers run. `/status` refreshes every 1 minute while the tab is open; red indicates a failed latest check or overdue data. After adding/changing keys in `.env`, recreate containers with `docker compose up -d --build --force-recreate api worker web`.

To create an administrator, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 12 characters) in the root `.env` before running `docker compose up` or `docker compose run --rm seed` again. Existing emails are not automatically promoted to admin. Ensure `POSTGRES_PASSWORD` and `DATABASE_URL` match before creating a new database. Do not use default credentials on the server.

For separate web/API development, run `docker compose up -d db`, `npm run dev:api`, `npm run dev:worker`, and `npm run dev:web` in order. API variables: [apps/server/.env.example](./apps/server/.env.example); web variables: [apps/web/.env.example](./apps/web/.env.example).

Compose passes root `.env` keys into containers: `TICKETMASTER_API_KEY` fetches Thai events using `TICKETMASTER_COUNTRY_CODE` and overseas events for artists in the catalog; `INSTAGRAM_GRAPH_ACCESS_TOKEN` and `INSTAGRAM_GRAPH_IG_USER_ID` enable Business Discovery for administrator-verified artist accounts; `GOOGLE_ROUTES_ENABLED=true` and `GOOGLE_ROUTES_API_KEY` provide driving distances for trip budgets. Fares remain **estimates**. Check token expiry using `INSTAGRAM_GRAPH_TOKEN_EXPIRES_AT` and keep keys in `.env` only. `META_APP_ID`/`META_APP_SECRET` are not used in this post-reading flow and are not passed into containers.

```powershell
npm run typecheck
npm test
npm run build
docker compose logs -f worker
```

## Concert Coverage and the Seven-Day Report

On [Data status](http://localhost:3000/status), view **Coverage by page** and choose **Automatic checks** or **Supplemental checks (excluded from the seven-day count)**. Reports show distinct URLs parsed, with no eligible data found, failed, or pending rotation, with source links and CSV for every URL. ThaiTicketMajor listing data does not count as successful detail verification and cannot overwrite existing time, price, status, or manual edits.

Download hourly CSV from `/api/status/concert-monitor.csv`, URL coverage with `?view=coverage`, supplemental coverage with `?view=coverage&scope=manual`, and Markdown from `/api/status/concert-monitor.md`. Select `windowId=2` to retain the 5 Oct 06:00–12 Oct 06:00 Thai-time window. Manual checks do not increase the acceptance count; the new version does not backfill URL evidence from old runs. Empty pages still need review and do not prove that every announcement was collected.

Ticketmelon checks the latest 20 entries before known events, then rotates through the catalog, up to 200 pages per run. `npm run concerts:sync -- --sweep` performs supplemental checks; `npm run concerts:report` exports reports without fetching news. The worker writes `concert-monitor-latest.{json,csv,md}` plus `.coverage.csv`/`.supplemental.csv` in the report directory. No new migration/environment settings are required. Update API/web/worker after the existing collection run finishes using `docker compose up -d --build --no-deps api web worker`; do not use `--start-monitor` to replace the existing window.

Results at 6 Oct 19:33: TTM 47 / Eventpop 58 / The Concert 36 / Ticketmelon 552 catalog URLs. Two Ticketmelon sources added one new event and one source to an existing event, for 377 events. All 181 server tests, 58 focused tests, and the final 11 tests passed with 0 skipped; typecheck/production builds and 5 actual Chrome scenarios passed. Existing window 2 remains 148/148, cadenceIssues 0, collecting. TTM's 43 detail pages remain inaccessible, and one Ticketmelon redirect requires review. [Evidence and remaining work](docs/concert-coverage-acceptance-2026-10-06.md)

## Administrator Biography and Artist Image Editor

Sign in as an administrator and open the [editor](http://localhost:3000/admin/edit), or choose **Edit artist biographies/images and concerts** on `/admin`. Search an artist name or load a slug such as `aheye-4eve`.

Edit the short biography; add/remove/reorder biography sections and enter text, source URLs, and source names for each section. Images support JPG/PNG/WebP uploads up to 2MiB, credited HTTPS URLs, or removal. Before replacing an image, provide its owner, title, rights, and confirm the credit; reusable licenses require a name and link. After saving, view the result on the public profile.

Administrator edits to biographies/images, including deletions, are protected from seed/audit/AI overwrites. Changing only an image preserves the existing AI biography label. Concurrent edits return a 409 warning and retain the draft so the latest data can be loaded; expired sessions hide the form. Image credits identify rights information supplied by the administrator; the supporting evidence still needs checking.

Migration `021_artist_editor.sql` runs automatically when the API/worker starts. Uploaded images are stored in PostgreSQL and included in database backups; replacing/removing an image deletes its previous file. No new volume or key is needed. Instagram news still stores only URLs. Update this version with `docker compose up -d --build --no-deps api web biography-worker` without restarting the concert worker collecting the seven-day report.

Checked on 6 Oct 03:17: 177 server tests passed/0 skipped, all 11 focused editor tests passed, typecheck/build/Docker passed, and 6 Chrome scenarios passed on desktop/390px and public profiles. API/web are running; the live database remains at 50/161/48 and the original worker is unchanged. [Report/limitations](docs/admin-artist-editor-acceptance-2026-10-06.md). Actual administrator UAT and database restoration with images on the VPS remain pending.

## Automatic Biographies with Local AI

`biography-worker` checks the queue every minute and works daily during **23:00–00:00 Asia/Bangkok**. It processes one profile at a time with no rows in `artist_biography_sections`, even if a short biography exists. Profiles with sectioned biographies or `biography_manual_override` are excluded. Each profile is attempted at most once per night, with a total limit of 10 attempts per night; there is no catch-up outside the window. The machine and Docker must be running during this period.

1. Read `artist_sources` and verified websites first; automatically search Thai/English Wikipedia by matching name when sources are insufficient. Check robots.txt for web pages and reject destinations on private networks.
2. Qwen3.8 27B writes 3–4 Thai sections from accessible source text and selects evidence IDs so the system can attach exact quotations and URLs to each section. Facts from model memory are prohibited; retain English names from sources when no verified Thai name exists.
3. Validate format, identity, exact quotations, and have the model review claims again. If validation fails, allow one repair based on the findings. Before saving everything in one transaction, recheck that the profile is still empty and nobody edited it during processing.
4. Cancel unfinished work at midnight. Record the reason when evidence is insufficient or AI is unavailable, then retry the next night. Unload the model after use to release GPU memory.

[Qwen3.8 27B](https://huggingface.co/Qwen/Qwen3.8-27B) was selected following the latest request to use a newer model. Its developer reports IFBench 79.5 and improved research/instruction following over the previous version. The installed variant is [Unsloth UD-IQ4_XS ~14.3 GB](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/blob/main/Qwen3.8-27B-UD-IQ4_XS.gguf), leaving room for an 8,192-token context and buffers on the RTX 5060 Ti 16 GB (32 GB system RAM). Full-model scores are not this quantization's scores; a benchmark comparing every model has not been performed.

Native Ollama on Windows stores models through `OLLAMA_MODELS=D:\AI\models`. Chat and biographies share `http://localhost:11434` but use different model names; the Docker worker calls `http://host.docker.internal:11434`, so there is no separate biography Ollama container. `npm run biography:setup` downloads through native Ollama and creates an alias from SHA256-pinned text weights, excluding the vision projector to save VRAM. Large-model and chat loads may need to alternate when VRAM cannot hold both. AI validation does not guarantee complete accuracy. Public profiles label biographies as AI-written and not yet reviewed by an administrator. View queue/heartbeat on `/status` and drafts/sources/errors on `/admin/biographies` (administrators only).

Results on 3 Oct 2026 (B.E. 2569): the live database still contained 37 profiles/117 sections and an empty queue. Text-only Qwen3.8 independently found sources for Tilly Birds in a separate database, validated/repaired/published 3 sections in **131.09 seconds**, then skipped the profile the next night because a biography existed. `ollama ps` showed **100% GPU, context 8192, memory ~13 GB**; `nvidia-smi` measured 14,810/16,311 MiB used and 1,243 MiB free, followed by unloading. The Docker worker received HTTP 200 from `http://host.docker.internal:11434` and found the configured model. Validation preserves song titles containing question marks and rejects unsupported popularity/growth claims. This is not a benchmark covering all artists or several nights of actual scheduled operation.

Configure root `.env`: `BIOGRAPHY_ENABLED`, `BIOGRAPHY_MODEL`, `BIOGRAPHY_WINDOW_START`, `BIOGRAPHY_WINDOW_END`, `BIOGRAPHY_MAX_PER_NIGHT`, `BIOGRAPHY_TIMEOUT_SECONDS`, then run `docker compose up -d --build --force-recreate biography-worker`. For development, use `npm run dev:biography` and `BIOGRAPHY_OLLAMA_URL=http://localhost:11434`. Preview a draft without changing the database using `npm run biography:preview -- tilly-birds`. Administrators can add supplemental sources through `PUT /api/admin/artists/:id/sources` with JSON `{ "url": "https://...", "label": "..." }`; automatic source discovery works without manually providing this link.

For integration tests, set `BIOGRAPHY_TEST_DATABASE_URL` to a test database whose name starts with `encore_biography_test`, then run `npm test` (fixtures are cleared only in that database). Without it, integration tests are skipped while policy/parser tests still run. On the VPS, point `OLLAMA_URL` to the user's Ollama through a VPN allowing only the server (for both chat and biographies), rather than VPS localhost.

## Implemented Features

- `/artists` shows names, types, genres, short biographies, and source links. `/artists/[slug]` shows sectioned biographies with sources beneath each section, concerts, and official accounts. The database check on 29 Sep 2026 (B.E. 2569) found biographies for **37/37 profiles, totaling 117 sections** (at least 3 per person/band; [Aheye 4EVE](http://localhost:3000/artists/aheye-4eve) has 7), referencing 51 URLs with no non-HTTPS URLs. Sample APIs for Aheye, Tilly Birds, MILLI, and Punch returned actual biography sections. Seeding fills only missing sections and preserves administrator edits. Biography length depends on available evidence; it does not claim to cover every life event.
- Profiles, artist/concert search and filters, news, source status, accounts/following/attendance records, performances, and administrator additions/edits through the web/API.
- Concert ingestion from public pages checks robots.txt, reads JSON-LD and verified Eventpop formats, stores source URLs/check times, deduplicates URLs and matches titles/dates, retains postponed/cancelled statuses, and preserves existing data when a source fails.
- Ideas from the previous Python providers were adapted for multi-offer JSON-LD prices without converting unknown prices to zero, Eventpop Open Graph, The Concert `/p/{id}` pages, and dates/status/prices from the [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/). The Concert discovers IDs from its [public highlights feed](https://cdn.theconcert.com/v3/concerts/en/highlight.json), then reads individual event pages permitted by robots.txt. Ticketmelon uses its public sitemap and embedded event data, checking the 60 most recently modified URLs per run and leaving unavailable prices empty. All 14 parser/robots tests passed.
- Tested primary sources ThaiTicketMajor, Eventpop, The Concert, and Ticketmelon, plus backups AllTicket and Live Nation Tero, according to actual accessibility. The 70 foreign Ticketmaster results reported on 29 Sep 2026 (B.E. 2569) came from keyword searches without verified artist identities and cannot establish coverage; unsupported entries were withdrawn on 3 Oct 2026 (B.E. 2569), as detailed below. The Concert retained actual prices of THB 699 and 3,500 with source URLs.
- Tested Instagram Graph with verified artist accounts: on 29 Sep 2026 (B.E. 2569), 6 accounts succeeded and 120 posts (20/account) were saved in the news feed. X/Facebook posts are not fetched because platform tokens are absent. News links are not added manually.
- Tested the Google Routes adapter with a 22.3 km sample route; road distance replaces user-entered distance when available. Ticket/transport/train/fuel prices retain separate categories based on their sources and estimate formulas.
- Native Ollama uses Qwen3 8B for question classification and summaries of readable posts. Thai drafts were tested with `num_ctx=4096` and `think=false`, but this biography batch was researched and checked against sources before publication. Chat factual answers are assembled directly from the database. pgvector uses 1,024-dimensional embeddings for additional document retrieval.
- Itemized trip budgets cover tickets, coaches, trains, private cars, flights, and accommodation. Ticket prices use available source data; transport/accommodation formulas are estimates, and unavailable prices are explicit. The Agoda Search adapter is limited to approved partners and disabled by default; live API access has not yet been obtained.

## Ticketmaster Artist Matching

On 3 Oct 2026 (B.E. 2569), fixed keyword matches such as `ATLAS`, `BUS`, and `THE TOYS` that had linked unrelated bands or venue names such as `Atlas Arena` to Thai artists. Domestic events now strictly filter venue `countryCode`. Foreign searches first resolve attractions using the exact catalog name plus a verified official social URL, or a manually evidenced attraction ID. Events are then fetched by `attractionId` and performers rechecked; foreign event titles do not add other artists automatically.

- Manual mappings use `ticketmaster_artist_identities` with `evidence_url` and a check time. Bodyslam is seeded as `K8vZ9172buf` with a [venue announcement](https://www.electricbrixton.uk.com/events/bodyslam-world-tour-2026/) as evidence. Other mappings require official evidence; identical names are insufficient.
- Migration `008_ticketmaster_identity.sql` archives 85 original unverified foreign events in `ticketmaster_import_archive` before removing them from listings/AI. Thai events, events with other sources, manually edited events, and attendance records are preserved. Private backup: `.local/ticketmaster-before-repair-20261003.sql`.
- Actual API checks on 3 Oct 2026 (B.E. 2569) found 15 Thai events and 1 verified foreign event: Bodyslam in London, GB. SQL found no Dame Atlas/Atlas Arena entries or foreign Ticketmaster events missing attraction IDs. The 156 events across all sources are a snapshot, not a coverage guarantee.
- `npm run typecheck`, `npm run build`, production Docker builds, and 45 tests passed with both `BIOGRAPHY_TEST_DATABASE_URL` and `INGEST_TEST_DATABASE_URL`. Repair integration tests use a temporary schema and rollback; without `INGEST_TEST_DATABASE_URL`, those tests are skipped.

Foreign events with unverified identities are not imported, and API failures preserve the latest data. Additional mappings and source-comparison UAT remain pending.

## Concert Images

On 3 Oct 2026 (B.E. 2569), Ticketmaster did not read `images`, and The Concert did not read `og:image`, although the sources contained images. Both now record/update `image_url` for existing events. Ticketmaster selects HTTPS images other than `fallback`, prioritizing 16:9 and the largest image within the same aspect ratio. Missing images remain empty with a placeholder instead of a generic provider poster.

Actual checks on 3 Oct 2026 (B.E. 2569) found images for 12/16 Ticketmaster events and 2/2 The Concert events. Four had only `fallback` images: SO JI SUB, MAHIRU, Young K, and Benjaphet. The API returned Bodyslam's actual image, whose URL returned HTTP 200, image/jpeg. `npm run typecheck`, `npm run build`, Docker builds, and 47 tests passed. Hourly ingestion uses the same reader. A source artist portrait may not be an event poster; source URLs can change or fail. Browser UAT remains pending.

## Instagram Ingestion per Artist

On 3 Oct 2026 (B.E. 2569), expanded from 6 accounts to **37 profiles**, verified through artist/label websites or official video descriptions, including all 7 individual 4EVE members. Evidence is in `apps/server/src/artist-instagram-accounts.ts` and existing profiles; label/fan accounts are not substituted for artist accounts.

The first check succeeded for **32/37 accounts**, fetching the latest 20 posts/account. The database accumulated 697 news items, 643 with media, containing 2,815 images and 365 videos. Punch returned HTTP 500/code 1; The Toys, Three Man Down, Tilly Birds, and Violette returned HTTP 403/code 4. These are snapshots, not proof of all posts or continuous availability.

The worker prioritizes accounts that have never succeeded, then the oldest check. It stops on Meta code 4/429, retains news and account states, logs failed sources, and retries hourly. Deferred accounts do not receive an updated check or success time. Expired tokens require user action; they are not renewed automatically.

To seed accounts and check one artist, saving actual news through the same collector used by the worker:

```powershell
docker compose run --rm --build seed
docker compose run --rm --no-deps worker node apps/server/dist/instagram-sync.js aheye-4eve
```

For development, complete `apps/server/.env`, then run `npm run instagram:sync -- aheye-4eve`. Historically, omitting the slug checked all verified accounts. JSON output reports state/time/post count per artist; unreadable accounts return exit code 1. `/api/news?artistId=<artist-uuid>` filters news by artist. Avoid repeated checks during quota exhaustion. Typecheck/build/Docker and 56 tests passed with 0 skipped, covering artist separation, rate limits, and retention of existing data.

## News Images, Videos, and History

Older news is stored in PostgreSQL. Sync upserts by original source URL and does not delete posts that fall outside the latest 20. `/news` has previous/next navigation, totals, 20 items/page, and a one-minute refresh. `/api/news?page=2` returns `total`, `page`, and `pageSize`, with counts matching the filtered `artistId`, and clamps pages beyond the available range to the last page.

The 3 Oct 2026 (B.E. 2569) pagination fix found 697 stored news items, 669 from before 3 Oct, with the oldest dated 7 Dec 2025 (B.E. 2568). Chrome page 2 showed 2 Oct news and navigation back to the latest page worked; API page 35 returned 17 items including the oldest. At 390px, there were no overflows/errors. Typecheck/build/Docker and 56 tests passed. This is accumulated history, not a complete historical backfill; each account supplies its latest 20 posts, and older media URLs can expire.

`/news` displays images, albums, and controlled video playback directly from Instagram CDN URLs in the browser. Media is not downloaded, stored, or proxied through the server. Only text, types, URLs, and covers are stored in `news_items.media_items`, added by migration `009_news_media.sql`. Access tokens are never sent to the browser; videos do not autoplay and use `preload="none"`.

Business Discovery reads `media_type`, `media_url`, `thumbnail_url`, and `children`, keeping video covers separate. When a video URL is missing or playback fails, an Instagram embed and the original post link are available. Embeds may be restricted or require login; a thumbnail is never treated as a video.

Meta's [Instagram changelog](https://developers.facebook.com/docs/instagram-platform/changelog/), checked on 3 Oct 2026 (B.E. 2569), says that from 30 Jul 2026 (B.E. 2569), `media_url` may be absent for copyrighted audio/Instagram audio-library content or copyright claims. Business Discovery also includes Reels whose owners disable downloads. Such posts may still be viewable on Instagram while the API returns HTTP 200 with a cover/text without a video URL. PROXIE `DeBeWBqMRV6` had a cover and null video URL; ATLAS `DeBc1UxolFH` had a URL. The API did not explain PROXIE's case, so music/download settings cannot be identified as its cause.

On successful syncs, the worker refreshes media for existing posts within the latest 20, since CDN URLs change. Open `/news` pages refresh every 1 minute. Caption changes clear summaries for regeneration; unchanged captions preserve them. Older posts outside the latest 20 can have expired media and fall back to embeds/source links.

An earlier 3 Oct 2026 (B.E. 2569) media snapshot had 174 news items, 120 with new metadata, 45 albums, 324 images, and 86 videos: 59 with direct URLs and 27 without. Actual Chrome checks loaded real images and 720px, 11.77-second video metadata, changed album images, created an Instagram iframe, and confirmed fallback after a simulated video failure. At 390px, there were no errors/overflows. Album-video checks used actual API posts reordered in the browser without database changes. Audio/embed UAT under actual viewer permissions remains pending. `npm run typecheck`, `npm run build`, Docker builds, and 53 tests passed.

## Artist, Official Account, and Image Rights Audit — 4 Oct 2026 (B.E. 2569)

Reviewed 37 profiles using official artist/label/management sources and file licenses. Individual internal reports: `docs/artist-popularity-audit-2026-10-03.md`, `docs/artist-membership-audit-2026-10-03.md`, `docs/artist-official-accounts-audit-2026-10-04.md`, and `docs/artist-image-rights-audit-2026-10-03.md`. As configured, docs are excluded from GitHub; runtime evidence is in `apps/server/src/artist-*-evidence.ts` and `artist-official-accounts.ts`.

- **Popularity:** Measured official video views for 18 main profiles and found primary reports for another 10. STAMP/Scrubb pages remained inaccessible due to HTTP 429; the 7 individual 4EVE members had only group evidence, which is not used as individual popularity evidence. Profiles show evidence type, measured value, date, source, and limitations. Metrics are not combined into a ranking, and `popularity_rank` is not guessed. This was a dated audit, not automatic view-count updating.
- **Membership/affiliation:** Corrected Violette's Your Girl to a Thai-language album; Musketeers members Ten/Big/Doi follow the label's 2024 (B.E. 2567) report. Cocktail's history includes its final tour from 26 Apr–24 Dec 2025 (B.E. 2568). Palmy's genie records affiliation is tied to a 2021 (B.E. 2564) report, with separate GMM evidence from 2026 (B.E. 2569). Managers, overseas agents, and music rights holders are not all interpreted as current label contracts. The live database contains **118 biography sections**.
- **Official accounts:** **70 links across 37 profiles**: Instagram 37, Facebook 16, X 14, websites 3. Added 26 Facebook/X links using owner evidence, rather than label footers/fan pages. Instagram uses evidence checked on 3 Oct and accessible websites read during this audit; no additional Graph requests were made. Link verification is separate from permission to read posts and actual read success.
- **Images:** Imported licensed image URLs for **13/37 profiles** (8 CC BY-SA 4.0, 4 CC BY 3.0, and 1 CC0), with creator, filename, image date, source/license links wherever displayed, and watermark-removal history for PP Krit's image. Full images are displayed without cropping and loaded directly from Wikimedia, without storing files on the server. Older images do not establish current membership. The other 24 profiles retain placeholders, including INK whose source-rights check remains incomplete.

Apply migration `010_artist_audit.sql`, then run `docker compose run --rm --build seed`. For an existing stack, rebuild/recreate only api/web. Seeding corrects only initial text matching the old erroneous version and adds images only when empty or when the existing URL matches the audited set. It preserves administrator text/image edits. Credits always match the exact image URL and are not inherited by a new administrator-supplied image.

Results on 4 Oct: typecheck, production build, Docker build, and **58 tests passed with none skipped**. Chrome loaded 13/13 actual images with matching credits; 7-member 4EVE relationships, corrected text, and pending popularity states displayed correctly. At 390px, there were no overflows/page errors. Remaining images, individual popularity, and rosters/contracts unclear in the latest sources still require review, followed by UAT.

## Remaining Limitations

- Expansion snapshot on 4 Oct 15:06: 50 profiles, 41 pages with image-rights evidence (4 use group portraits), and 9 pending. All 50 Instagram accounts are verified, but Facebook/X coverage is incomplete. Popularity evidence includes 40 snapshots and 10 primary reports; collaborative work views are not individual scores. Pending membership/affiliation announcements and biography/image UAT remain in docs/acceptance.md.
- Concert sources have access limitations: some ThaiTicketMajor pages return Access Verification; some Ticketmelon URLs redirect; Eventpop may return HTTP 429. Check `/status` and metrics before claiming coverage. The 4 Oct collectors use Eventpop categories, The Concert public API with performances, and Ticketmelon sitemap rotation to replace earlier limitations.
- Instagram feeds cover only accounts accessible to Business Discovery. The per-artist check on 3 Oct 2026 (B.E. 2569) succeeded for 32/37 accounts, with the limitations above. Some X/Facebook account links exist, but post-reading tokens are absent. Missing permission or expired tokens are shown honestly; fake sample posts are not generated.
- X ingestion limits post reads to a THB 350/month budget using a conservative THB 50/USD assumption. Also set a spending limit in X Developer Console because actual pricing and exchange rates can change.
- Agoda/BusOnlineTicket require partner permission before connecting actual prices. Traveloka/SRT D-Ticket links support manual price checks. Trip budgets use Google Routes distance when enabled and a route exists; otherwise, they use user-entered distance and clearly label estimates.
- Google Routes is called when users calculate a trip budget and `GOOGLE_ROUTES_ENABLED` is enabled. Routes are cached for 24 hours, and calculations are limited to 5 requests/minute/IP. Set a [daily quota in Google Cloud](https://developers.google.com/maps/documentation/routes/usage-and-billing) before public access to control the travel API budget.
- Seven days of continuous worker operation, UAT with 15–20 people, database recovery, VPS migration, and private-network Ollama access remain required for the mid-February 2027 (B.E. 2570) delivery plan.

`docker-compose.prod.yml` and `Caddyfile` are starting points for deployment. Configure secrets through environment variables on the destination machine.

## Concert Audit and Seven-Day Report — 4 Oct 2026 (B.E. 2569)

Local research scraping is enabled following the latest requested change: set `CONCERT_LOCAL_RESEARCH_ENABLED=true` in root `.env`; Compose passes it to the worker. Examples/defaults remain `false`. Before cloud publication, resolve content/image reuse rights for each source, then set `CONCERT_REUSE_AUTHORIZED_SOURCES` to authorized source names separated by commas. Running locally is not evidence of public publication rights.

- **ThaiTicketMajor:** Reads listings/details and JSON-LD. An HTTP 200 access-verification page counts as an ingestion failure, not success or empty data.
- **Eventpop:** Discovers `/g/concert` and `/g/music-festival`, prioritizes current performances over metadata, supports date/time ranges and satang prices, and identifies events by event ID. It does not read robots-disallowed `/events/.../showtime`. EDC beach-party dates/titles are separated from the festival, and hotel/shuttle packages do not create duplicate performances.
- **The Concert:** Reads all supported public listing API pages, then detail/round APIs. Verifies country and music genre, including luk thung/mor lam, without restricting coverage to central Thailand. Zero prices are accepted only with `price.status=true`; unannounced default prices remain unknown.
- **Ticketmelon:** Reads the event sitemap, checks latest/existing events, and rotates remaining entries using a database cursor. Default: 200 pages/run, configurable with `CONCERT_DETAIL_LIMIT` (20–1,000). It no longer repeats only the same 60 URLs. Music-series episodes are separated from concerts, while music livestreams remain supported.

On HTTP 429, requests to that source stop immediately and a Retry-After cooldown is stored (at least 1 hour). Eventpop retains its continuation position and waits 2 seconds between detail requests. Cooldown runs record `skipped` with reasons. Partially readable sources use `partial`, recording discovered/attempted/fetchFailures/pending/rejectedDates in `sync_runs.metrics` while preserving existing data. AllTicket is tried before Live Nation Tero when primary sources are limited.

Migrations `011`–`014` add cadence tracking, historical performance times, price notes, backoff, and archives with snapshots for Eventpop dates with invalid years >=2100. They preserve manual events, attendance, and events supported by other sources, without guessing replacement dates. Old performances absent from the latest announcement remain labeled in history. Table/package prices and currently unannounced prices have notes; trip budgets do not automatically multiply them as per-person prices.

```powershell
# Read root .env; relative report paths use the repository root; manual runs do not count as seven-day automatic cadence evidence
npm run concerts:sync
npm run concerts:sync -- --sweep
npm run concerts:report
# After changing configuration/code
docker compose up -d --build api worker web
```

`--sweep` checks up to 1,000 catalog details/source for a one-time audit; it does not fetch Instagram or foreign APIs. Reports at `/status` and `/api/status/concert-monitor` distinguish **scheduled checks** from **ingestion results**, with CSV/Markdown downloads. The worker stores hourly cycles in the database and uses an advisory lock to prevent duplicates after restarts. Reports are written to `.local/concert-reports/concert-monitor-latest.{md,csv,json}` through a Docker volume on every idle worker tick and survive container recreation.

The actual acceptance window is **4 Oct 2026 (B.E. 2569) 03:00 – 11 Oct 2026 (B.E. 2569) 03:00 (Asia/Bangkok)**: 168 hours × 4 sources = 672 rows. Future hours are not missing; manual/legacy runs do not fill gaps, and the window cannot pass before it ends. Missing runs after machine/worker shutdown appear in the report. Check counts do not guarantee that every announcement updates within an hour.

Evidence on 4 Oct: a Ticketmelon sweep read 554 URLs and obtained 208 sessions (144 new source identities), with 1 redirect outside the source. The Concert's genre fix read 29 IDs and obtained 29 sessions from 28 events, excluding Talk Shows. Eventpop's worker read 61 IDs and obtained 39 sessions, excluding 3 invalid dates. ThaiTicketMajor's worker obtained 3 sessions but encountered verification on 45 pages. These are snapshots, not counts of every event online. Source-comparison/acceptance reports and sample HTML remain in `docs/`/`.local/`.

Typecheck, production build, and Docker build passed; the full suite had **72 passing tests, none skipped**, with focused cadence/result separation and archive data-protection tests. Chrome verified reports and CSV downloads with 673 lines (header + 672 rows); desktop/mobile 390px had no page errors/overflows. Seven-day results, repeat coverage checks, and UAT remain pending; overall project acceptance has not passed.

## Instagram Ingestion and Usage — Checked 4 Oct 2026 (B.E. 2569)

Instagram Graph Business Discovery reads the **latest 20 posts/account**, with captions, timestamps, image/video URLs, and album items (`children.limit(20)`) in one request/account. It does not paginate through the complete history; these 20 may include old posts from infrequently posting accounts. Stored news remains in PostgreSQL, and opening/changing news pages reads our database without new Graph API requests.

At 02:40 Thai time, there were 37 verified Instagram accounts and 817 Instagram news items. Account count increased from 6 to 37 on 3 Oct. The successful 23:15 run read 740 posts (37 × 20), including rereads of existing posts, not 740 requests or 740 new items. Hourly runs reread the latest set to update text/media URLs.

**Limitations found before the fix, at 02:40:** News scheduling retained the last run time only in worker memory and therefore fetched immediately after restarts. Logs confirm runs on 4 Oct at 02:11, 02:18, and 02:25 during concert collector redeployment, successfully reading 35/5/7 accounts before Graph HTTP 403 code 4. Runs stopped on rate limits but did not read usage headers or persist usage-based cooldowns, so the causes' proportions in the screenshot's `Total Time Usage Rate 99%` cannot be determined. Pending work was database scheduling, request spreading, and usage-header cooldowns. This audit read only code/database data and made no additional Meta API calls; evidence: `.local/instagram-usage-audit-2026-10-04.json`.

### Behavior After the Fix — Enabled 4 Oct 2026 (B.E. 2569), 03:07

- Store per-account `next_sync_at` and global cooldowns in PostgreSQL (migration `015`) with an advisory lock. Restarts and `npm run instagram:sync -- artist-slug` do not bypass cooldowns/check intervals. Without an artist argument, the command checks one due account rather than immediately sweeping all accounts.
- The worker checks every minute, choosing one due Instagram account with at least 60 seconds between account-check starts. The same account is checked after `SOCIAL_SYNC_INTERVAL_MINUTES` (60 minutes). Cooldowns, shutdowns, or long-running jobs can delay checks; `/status` shows actual fresh/due account counts. AI work remains hourly to avoid starting ten post summaries every minute.
- The initial request reads latest20 text/identity without media URLs or album children. Media is requested for new posts, changed text, empty media, or after 6 hours. This can mean two requests/account, with 2 seconds between probe/media requests. Metadata updates retain existing images/videos and old news; no full historical pagination is performed.
- Read only numeric `X-App-Usage`/`X-Business-Use-Case-Usage`: usage >=75% pauses for 30 minutes; >=90% pauses for 60 minutes. Rate-limit cooldowns start at 60 minutes and increase on repeats, using the longer Retry-After/estimated-regain time. Cooldowns survive restarts and preserve latest data. Missing/unreadable headers show no latest value rather than 0%.
- Configure `INSTAGRAM_REQUEST_SPACING_SECONDS=60`, `INSTAGRAM_MEDIA_REFRESH_HOURS=6`, `INSTAGRAM_USAGE_PAUSE_PERCENT=75`, and `INSTAGRAM_RATE_LIMIT_COOLDOWN_MINUTES=60` in root `.env`; see `apps/server/.env.example`. Apply changes with `docker compose up -d --build api worker web`. `/status` shows cooldowns and usage with the observed time without additional Graph API requests.

Results at 03:07: Instagram news remained at 817 items; the previous cooldown was retained until **4 Oct 03:25:40 Thai time**. Two simulated worker starts using the actual scheduler made no external requests/additional Instagram runs. The full suite had 71 passed/1 skipped (biography database unset); the final focused Instagram/scheduler suite had 12 passed. Typecheck, production build, and Docker build passed. Chrome desktop/mobile 390px had no page errors/overflows or Graph requests from the status page. Evidence: `.local/instagram-usage-browser.json` and `.local/instagram-restart-repro.mts`. **Actual usage headers and trends after cooldown remain to be measured**; this does not claim the Meta dashboard usage has already decreased.

## Plan Status — 4 Oct 2026 (B.E. 2569), 14:34 Thai Time

Local API snapshot: 37 profiles, 355 concerts, and 823 news items. Actual Instagram usage headers were read at 14:33: call21%/time80%/CPU0%, with automatic cooldown until 15:03; fresh27/37 and 10 accounts due. The cooldown mechanism is confirmed, but continuous stability/freshness still need measurement; usage is not claimed to decrease continuously.

The concert report had covered 11 hours, expecting 44 source checks, with 16 results (12 successful/4 partial) and 28 missing checks during 06:00–12:00. Verdict remains collecting. Missing-run causes must be checked before certifying seven-day operation; manual runs do not fill gaps.

Next work in order: verify worker/concert/Instagram continuity; implement authorized X/Facebook post discovery with actual samples; complete Thai chat/recommendation/trip-budget tests; request access and test Agoda/BusOnlineTicket; assess Skyscanner feasibility; complete unverified artist/image/membership data and adapt UI to Figma. Before 15 Feb 2027 (B.E. 2570), authorization/session, AI offline/concurrent-load testing, UAT with 15–20 people, backup/restore/VPS/VPN, and the overall service budget still need checking. Pending work/evidence are in `docs/acceptance.md`.

## Artist Expansion to 50 Profiles — 4 Oct 2026 (B.E. 2569), 15:06 Thai Time

Added POTATO, KLEAR, LOMOSONIC, NUM KALA, D GERRARD, F.HERO, URBOYTJ, Joey Boy, Daou Pittaya, Offroad Kantapon, LYKN, Nené, and NuNew. The live database has **50 profiles / 160 biography sections** with sources per section; all 50 have Instagram verified through artist/label channels, totaling 84 official-account links. The 50-profile target includes bands, solo artists, and 7 4EVE members; it does not mean 50 main bands or a top-50 popularity ranking.

- **Membership/affiliation:** Migration016 stores membership_evidence, distinguishing current/historical/unclear information with announcement dates and sources. Only Monday's GeneLab affiliation is historical for 2023 (B.E. 2566), with the 21 Feb 2026 (B.E. 2569) contract-termination announcement added. Added ATLAS's six names from the 22 May 2026 (B.E. 2569) interview and PROXIE/4EVE credits from 2026 (B.E. 2569). Label contracts, management, and distribution are separate; transfer dates and current contracts are not inferred from old song credits.
- **Popularity:** Measured official works for the 13 new profiles, STAMP/Scrubb, and all 7 4EVE members. There are 40 snapshots/10 primary reports, with measurement/document dates and limitations displayed. Mind has a solo performance; the other 6 members have collaborative credits. Views belong to the complete video, are not divided into per-person counts, and do not form a combined ranking.
- **Images:** Added 28 pages, totaling 41/50 with creators/licenses/sources/modifications. Closed 19 of the original 24 pending entries plus 9 new ones. Jorin/Taaom/Fai/Punch use a full 4EVE group image labeled as not an individual portrait in both list/detail views. Another 9 profiles—BUS, ATLAS, MILLI, Only Monday, Dept, KLEAR, LOMOSONIC, NUM KALA, and URBOYTJ—remain without verified licensed images. Chrome loaded 41/41 at 15:06; this does not guarantee continuous CDN availability.
- **Data protection:** Seeding modifies only matching old text, adds sections without overwriting administrator work, ties credits to exact image URLs, and preserves newer audit results. No Meta Graph API requests were made for this research. New accounts await the existing worker cadence/usage guards; there is no manual backfill.

For an existing database: `docker compose run --rm --build seed`, then `docker compose up -d --build --no-deps api web`; do not delete the volume. **82 tests passed/0 skipped**, along with typecheck, production build, Docker build, and Chrome desktop/mobile 390px checks. Verified LYKN search, filtering 7 members, 50 unique profiles, group-image captions, and no overflows/page errors. Evidence: `.local/artist-expansion-{snapshot-2026-10-04.json,browser.json,tests-2026-10-04.log}` and `docs/artist-expansion-2026-10-04.md`.

UAT and validation of every life event remain open, along with images for 5 previously listed profiles, pending contract evidence, and member cards for other bands. Verified rosters for other bands are shown as dated, sourced text. This round supersedes the earlier 37-profile/13-image/pending-member-popularity status above.

## Next Work According to the Plan — 5 Oct 2026 (B.E. 2569), 04:40 Thai Time

Read local status/reports without additional provider calls: **50 artists / 361 concerts / 1,116 news items**. Latest Instagram headers at 04:39:43: call13% / time34% / CPU0%, no cooldown; fresh29/50 and pending21. These are measurements from this check, not evidence that every account is fresh or usage is stable all day. The biography queue is 0, with no new AI publication jobs.

The concert report covered 25 hours, expecting 100 slots with 72 checked. The same 28 cadence slots remained missing on 4 Oct 06:00–12:00 (4 sources × 7 hours). Current/future-hour slots are not counted as missing. Latest ThaiTicketMajor checks remained partial for 44 pages and Ticketmelon for 1. Verdict is collecting, not seven-day acceptance; the original window ends 11 Oct 03:00. Investigate causes and collect a genuinely continuous passing window while preserving the original gap evidence.

Current priorities: (1) inspect worker/sleep/restarts/AI timing and freshness for all 50 Instagram accounts, plus concert coverage/fallbacks; (2) collect actual authorized X/Facebook post evidence; (3) expand Thai chat/recommendation/trip-budget tests and test travel API access; (4) verify user isolation/admin/session expiry and AI offline behavior; (5) complete images for 9 profiles/pending affiliation announcements and prepare for Figma on 15 Oct. UAT with 15–20 people and VPS/restore/VPN remain scheduled before 15 Feb 2027 (B.E. 2570).

## Worker Continuity Fix and New Acceptance Window — 5 Oct 2026 (B.E. 2569)

- Windows System logs confirm shutdown on **4 Oct 05:46–13:17 Thai time**, matching the missing 06:00–12:00 concert checks, totaling 28 slots. Results are not backfilled. The original window remains selectable on `/status` or `/api/status/concert-monitor?windowId=1`, with its CSV/Markdown reports.
- Instagram, concerts, X/Facebook, reports, heartbeat, and AI run independently with overlapping-job protection. Concert work previously took about 6 minutes, and AI could block news ticks. The local Instagram queue is checked every 5 seconds, but **account-check starts remain at least 60 seconds apart**, each account remains at least 60 minutes apart, and existing database cooldowns are preserved. Required probe/media requests still share one slot; no additional historical fetching occurs.
- Migration `017_worker_continuity.sql` stores heartbeat and hourly AI runs/locks across restarts. `/status` warns that the worker may have stopped when heartbeat is older than 3 minutes; opening the page does not trigger Graph sync. The machine and Docker must run throughout acceptance collection.
- ThaiTicketMajor excludes `/name/` and `/latest/` sorting links from detail checks. Access Verification event pages remain partial; verification is not bypassed. AllTicket's homepage required JavaScript and its public catalog returned HTTP403 in testing. The limitation is displayed and Live Nation Tero is tried next, obtaining 14 sessions in the latest run. This does not establish that every missing event has been replaced.
- Fixed API/worker/web versions started at **05:04 Thai time**. Snapshot at 05:05: 50 verified Instagram accounts, all 50 previously successful, fresh30/pending20; usage call12%/time26%/CPU0%, no pause. These are instantaneous values; the queue must continue, and freshness for every account is not guaranteed during Meta cooldowns.

The new window is **5 Oct 06:00–12 Oct 06:00 Thai time** (`windowId=2`), not yet passed seven-day acceptance. Start a new window only when necessary using the command below (no provider calls). Original windows/logs are retained, and worker restarts do not automatically start new windows:

```powershell
docker compose run --rm --no-deps worker node apps/server/dist/concert-sync.js --start-monitor --reason 'Reason for starting a new acceptance window'
```

See the latest acceptance results/evidence in `docs/acceptance.md` and `docs/worker-continuity-2026-10-05.md`. The actual 168-hour window, Instagram freshness under real usage, and comparison of inaccessible ThaiTicketMajor entries against organizer announcements remain pending.

Results at 05:08: successful Instagram checks at 05:04:20 / 05:05:25 / 05:06:30 / 05:07:35, about 65 seconds apart, even while the first AI job finished at 05:05:44 (84 seconds). Fresh32/pending18. `npm run typecheck`, `npm run build`, Docker build, and **87 tests passed/0 skipped** using a separate fixture database. Chrome at 390px had no overflows/page errors. Reports/test logs: `.local/worker-continuity-*2026-10-05*`.

## Trip Providers and Test Results — 5 Oct 2026 (B.E. 2569)

Uses **Agoda (accommodation), Traveloka (flight links), BusOnlineTicket (coach links), and SRT D-Ticket (train links)**. Amadeus Self-Service/12Go are no longer connected; migration018 disables the old sources while retaining logs, and status displays them as retired. Live-price access for new sources is unconfirmed. Defaults are formula estimates/unavailable prices with source-check links. The website does not sell tickets or book trips.

Agoda Online Affiliates/MSE provides a Search API requiring partnership, sandbox/certification, and production approval. Credentials/endpoints are provided to partners, not guessed from documentation. Configure root `.env` only after approval:

```dotenv
AGODA_ENABLED=false
AGODA_CLIENT_ID=
AGODA_CLIENT_SECRET=
AGODA_TOKEN_URL=
AGODA_SEARCH_URL=
AGODA_ENV=sandbox
AGODA_PROPERTY_IDS_JSON={}
```

Use Agoda-supplied URLs (the adapter validates HTTPS/Agoda hosts), site ID/secret, and actual mapped property IDs, such as a `BKK` map key with an array of authorized IDs. No fictitious production IDs are supplied. Enable `AGODA_ENABLED=true` when ready, then `docker compose up -d --build --no-deps api web`; do not restart the worker merely to change pricing keys. Without approval or when the API fails, accommodation remains estimated. Sandbox prices are labeled test data and observed; production uses live prices with timestamps/links/dates/guest counts. Per-room/per-night prices are not treated as full-booking totals, booking totals are not multiplied again, and unconfirmed selling floors are not guessed.

BusOnlineTicket advertises an XML API through its affiliate program, but we lack access/schema, so it remains a link. Traveloka uses its flight-search page; no approved consumer flight-price API has been obtained. SRT uses an official link. Skyscanner has a Live Prices API, but partner criteria may exclude a student project. Primary-source research: `docs/travel-provider-alternatives-2026-10-05.md`.

**Verified results:** **104 server tests passed/0 skipped** in a separate fixture database; the final 17 focused tests passed. Typecheck, production build, and Docker API/web builds passed. Chrome desktop/mobile 390px displayed per-item currencies, 4 price categories, source links/times, and cleared old results after errors. Screenshots with live prices use browser-only mocks, not actual Agoda quotes.

Native Ollama answered all 6 Thai question types with HTTP200 and fixture sources, and summarized actual news during chat. While the 27B biography model ran, chat still timed out after 60 seconds/returned 503 during model switching; a retry succeeded. **Immediate chat responses during 27B work remain an open acceptance criterion.** No fictitious data/test biographies were published to the live web database. `docs/ai-trip-acceptance-2026-10-05.md` and `.local/ai-trip-*2026-10-05*` distinguish mocks, real Ollama, and earlier failures.

Database tests require `INGEST_TEST_DATABASE_URL` and `BIOGRAPHY_TEST_DATABASE_URL` pointing to dedicated databases whose names contain `test`; never run `npm test` against the application database. Enable `AI_ACCEPTANCE_LIVE_OLLAMA=true` only for actual GPU testing at localhost11434 with both models (about 2 minutes, possibly longer with queues). Do not enable this flag in normal CI.

Approved API credentials/costs within THB 150, actual hotel mappings/fees, production quotes, chat scheduling during full biography work, and VPS/VPN/UAT remain pending. Simulated results do not replace actual live-price verification.

## Next Priorities — 5 Oct 2026 (B.E. 2569), 16:33 Thai Time

Read-only local snapshot: 50 profiles/364 concerts/1132 news items. Instagram fresh50/50, paused=false; usage call21%/time41%/CPU0%. This does not certify all-day freshness. Worker heartbeat stale=false. Monitor window2 covered 10 hours, checked40/40, cadenceIssues0, partial11; still collecting, ending 12 Oct 2026 (B.E. 2569) 06:00 Thai time. No additional sync/Meta/provider calls were made.

Recommended order: (1) queue/prioritize chat8B and biographies27B, fix timeouts, and test full biography work; (2) integration tests for user/admin/session-expiry/isolation across all endpoints; (3) review partial concert coverage while continuing the original seven-day window without resetting; (4) collect actual authorized X/Facebook post evidence; (5) complete rights for 9 pending images/membership-affiliation evidence and prepare for Figma on 15 Oct. Agoda/BusOnlineTicket live prices await access; estimates/search links remain valid under the plan's reduced integration scope.

UAT with 15–20 people on 16–31 Jan 2027 (B.E. 2570) and VPS/VPN/backup-restore/monitoring before 15 Feb 2027 (B.E. 2570) remain pending. This is prioritization, not the start of code changes or closure of unmet criteria. Snapshot evidence: .local/next-steps-snapshot-2026-10-05.json.

## Requesting Travel API Access — 5 Oct 2026 (B.E. 2569)

Guide and contact templates: `docs/travel-api-access-guide-2026-10-05.md`. Agoda: use Partners/Travel Distribution Support, choose Agoda Affiliate / API Inquiry, and request Online Affiliates/MSE Search API. BusOnlineTicket: Affiliate Registration and Contact Us, or sales@busonlineticket.co.th, specifically to request XML API access. These routes were verified on official pages, but no application/contact/approval has occurred. Affiliate registration alone does not satisfy API-access acceptance. Student eligibility, localhost/prototype review, quotas/fees, and price display/cache rights still require confirmation.

## Without a Price API: Widgets/Links and Manual Prices — 5 Oct 2026 (B.E. 2569)

**User-selected scope implemented on 5 Oct 2026 (B.E. 2569):** Agoda/Traveloka/BusOnlineTicket/SRT D-Ticket search links plus user-entered selected prices are the core scope. Automatic live prices are optional, not a core delivery condition. `/assistant` provides price/currency/unit/source fields and a copied-text helper. Without approved affiliate code, it opens source links; there is no full-page iframe or supposedly approved widget. Agoda search boxes and BusOnlineTicket widgets require account code/permission checks after approval: https://partners.agoda.com/tl-ph/faq.html and https://www.busonlineticket.co.th/affiliate-program/.

Embedding does not automatically make price data available to Encore; browsers restrict cross-origin reads, and providers may prohibit framing. Documentation: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy and https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors.

Supported flow: open the source -> enter/paste pricing text -> choose the desired amount/currency -> verify dates, people, rooms, nights, units, and fees -> calculate/save the budget. The “User-entered price” label is separate from live/observed/estimate/unavailable and records entry time, not the provider's quote time. Totals include tickets + one transport method + accommodation, separate currencies, and no FX conversion. One-way per-person prices estimate return travel ×2; per-room/per-night prices multiply rooms×nights; totals are not multiplied twice. Blank inputs retain existing data/estimates; 0 is allowed. If some prices are unavailable, only known items are subtotaled.

Calculating/saving requires login. Migration019 stores inputs/results in `trip_budgets`, isolated by session user and concert. Repeated saves update the existing budget; use “Load saved budget” for the same event. Public prices are not overwritten. The selector shows the first 20 events, but planning links from detail pages can load events beyond page one.

The paste helper runs in the browser without a price API, automatic clipboard reads, or fetching pasted URLs. It supports THB/Thai-baht labels/฿ and 10 ISO currencies, comma thousands separators, and up to 2 decimal places. It returns multiple candidates without guessing the lowest amount, units, dates, or fees. Ambiguous formats require manual entry. There is no OCR/extension/provider scraping for trip prices; limitations and researched alternatives: `docs/travel-prices-without-api-2026-10-05.md`.

Results: **110 server tests passed/0 skipped** with separate PostgreSQL fixtures; 21 focused tests and 12 parser cases passed, along with typecheck/production build/Docker API+web builds. Chrome desktop/mobile 390px passed amount selection, unit payloads, blank/0 inputs, save/load, clearing stale totals after input changes/errors, page-two events, and no overflows/page errors. HTTP integration confirmed unauthenticated401/other-user404/upsert retaining1record/no public-price modification. Browser prices are fixtures; the application database contains no fictitious prices. Report: `docs/manual-trip-acceptance-2026-10-05.md`; logs: `.local/manual-trip-tests-2026-10-05*.log`, `manual-trip-browser-2026-10-05.json`, `manual-price-parser-2026-10-05.json`.

Defaults require no travel-price credentials (`AGODA_ENABLED=false`). Update with `docker compose up -d --build --no-deps api web`; the API applies migration019 automatically. Enabled Google Routes provides only distance for transport estimates, not bus/train/flight/hotel prices. Unit/fee comprehension UAT, combined session-expiry tests, AI27B with chat, seven-day collection/VPS/VPN remain pending; reducing live-price scope does not close these criteria.

## Priorities After Manual Trip Budgets — 5 Oct 2026 (B.E. 2569), 17:22 Thai Time

Read-only local API status: 50 profiles/368 concerts/1132 news items, with a fresh worker heartbeat. Monitor window2 covered 11 hours, checked44/44, cadenceIssues0, but partial12; still collecting, ending 12 Oct 2026 (B.E. 2569) 06:00 Thai time. Instagram fresh33/50, pending17, usage call26%/time75%/CPU0%, with a usage-guard pause until 17:33:34. This was measured at 17:03, not continuously every second. Track resumption and pending-account reduction after cooldown without accelerating manual sync. Evidence: `.local/next-steps-after-manual-2026-10-05.json`.

Next priorities:
1. **GPU queue/chat with27B:** Fix model switching that causes 60-second chat timeouts/503, then test Thai chat during full biography work. Preserve web data/messages when AI is unavailable.
2. **Authorization/accounts:** Integration tests for user isolation/admin/session expiry across every endpoint, including budget reads/saves. Passing private-budget tests do not establish complete authorization across all systems.
3. **Continuity/coverage:** Retain the original seven-day window without resetting. Review the 41 inaccessible ThaiTicketMajor details from the 17:00 run, fallbacks, and each source's partial results, plus Instagram after cooldown. Complete check counts do not mean every page was read successfully.
4. **News across platforms:** At least 1 actual X/Facebook post per platform under available permissions/tokens, verifying automatic discovery and unavailable-account states.
5. **Artists/UI:** Rights-backed images for 9 profiles, pending membership/affiliation announcements, biography UAT, and Figma preparation for 15 Oct; price-unit/fee UAT for implemented budgets.

Automatic live prices/OCR/extensions are optional under the revised scope; core work need not wait for price APIs. UAT with 15–20 people on 16–31 Jan 2027 (B.E. 2570) and VPS/VPN/backup-restore before 15 Feb 2027 (B.E. 2570) remain pending. This round updated priorities/evidence only; no GPU/authorization/provider changes or new tests were performed.

## Deployed GPU Queue — 5 Oct 2026 (B.E. 2569)

API, news/embedding, and biography jobs share a PostgreSQL queue (migration 020), with chat priority 100 and background priority 0. When chat waits, background requests are cancelled and their model released before freeing the GPU. The same step's request in the same job restarts after 15 seconds without chat. Session locks/heartbeat prevent overlapping inference; complete JSON is read before releasing ownership. Chat retains a 60s total timeout and keeps 8B loaded for 5 minutes; background jobs release their model after completion. Existing nightly caps/biography validation/data policies remain in effect.

Set `OLLAMA_RESOURCE_ID=encore-local-gpu` consistently across processes sharing the GPU/database; `OLLAMA_BACKGROUND_QUIET_SECONDS=15` supports 0–300. Defaults work without new keys. Development/production Compose and `apps/server/.env.example` include these variables. Update with `docker compose up -d --build --no-deps api worker biography-worker` after the current collector run finishes; the seven-day report is not reset. Counters are available through `/api/status.gpu`. The queue stores only model/time/status/priority/preemptions, not chat text.

**Verified results:** 119 server tests passed/0 skipped, 32 focused tests passed, and typecheck/production build/Docker builds for all three services passed. Two Node processes called actual native Ollama: all 6 chat types returned 200 at the start of 27B work (0.534–4.044s); another question while 27B occupied the GPU returned 200 in 25.529s. The biography job was preempted 2 times, then read/drafted/reviewed/published 4 Tilly Birds sections in a separate database in 217.319s. The live web database remained at 50 artists/160 sections. Timeouts were not increased to obtain passing results, and GPU measurements were not replaced by mocks.

The system prompt was corrected to distinguish news/posts from concert searches after a Tilly Birds news question was misclassified during testing. A repeat returned the correct news/sources. Earlier 503 results and classifier failures are retained. `docs/gpu-queue-acceptance-2026-10-05.md` and `.local/gpu-live-*2026-10-05*`/`gpu-tests-2026-10-05*.log` distinguish actual/fixture/failed runs.

The tested timeout case during 27B work is closed. Multi-user UAT, actual 23:00 scheduling across several nights, biography accuracy, VPS-VPN, and prolonged database-disconnection testing remain pending. Work switches sequentially, so model-loading time remains and immediate answers are not guaranteed. Next planned work is user/admin/session-expiry integration testing while tracking concert/Instagram/seven-day coverage and obtaining X/Facebook evidence.

Deployment completed at 18:08 Thai time: API/worker/biography-worker use the final version, health=true, the queue is empty, and Ollama has no model left loaded after tests. The 18:00 concert run finished before worker restart. Original monitor window 2 covered 12 hours/48 of 48/cadenceIssues 0, still collecting until 12 Oct 06:00 without reset. The live database had 50 artists/369 events/1135 news items; event/news counts change through normal worker activity. Evidence: `.local/gpu-deployment-2026-10-05.json`.

## User/Administrator Authorization and Sessions — 5 Oct 2026 (B.E. 2569)

Checked all 32 current API method/path variants: public 9/auth 3/private 9/admin 11. Used two users+admin+guest+forged/revoked tokens/expired user and admin sessions. Follows/attendance/news/recommendations/chat/trip-budgets are isolated by owner; owner/role inputs in bodies/queries/headers cannot change permissions. Ordinary users accessing admin receive 403; invalid sessions receive 401. Other users, including administrators, cannot read private budgets and receive 404. Admin demotion/account deletion takes effect on the next request. HTTP tests exercised every permitted admin endpoint and verified that rejected requests do not change data.

All API responses now use no-store/Vary:Cookie. Malformed cookies do not cause 500, and unusable tokens are cleared. Sessions are rechecked after waiting for AI and before returning results/saving budgets after provider calls. The frontend clears identity/follows/admin drafts/answers and sources/budgets/prices/pasted text on 401, account changes, or logout, and discards late responses for the previous account. Cross-tab notices store neither tokens nor user data. Account/admin/assistant check me every 60 seconds while visible and on focus. Logout avoids reload to prevent races with a new login. Expiry on an open page becomes visible on 401/focus/check intervals; exact-second expiry display is not guaranteed.

Evidence: [Authorization report](./docs/authorization-acceptance-2026-10-05.md). authorization.test.ts passed 45 tests including parents; all 164 server tests passed/0 skipped, along with typecheck/production build/Docker API+web builds. Nine Chrome desktop/mobile 390px scenarios had no page errors. Browser checks use fixtures; HTTP uses separate PostgreSQL and actual sessions/hashes/handlers/queues, mocking only Ollama/Google Routes. No actual provider/GPU requests were made for authorization testing.

To run: set INGEST_TEST_DATABASE_URL to a separate database starting with encore_ingest_test, then `node --import tsx --test apps/server/src/authorization.test.ts`. For the full suite, also set BIOGRAPHY_TEST_DATABASE_URL to encore_biography_test, then run npm test; unset variables cause integration tests to skip. Update with `docker compose up -d --build --no-deps api web`; no new migration/environment variables.

Deployed and checked through proxy 3000 at 18:42:55 Thai time: health true, all 9 guest endpoints returned 401/no-store/VaryCookie, and public pages returned 200 despite malformed cookies. The live database contained 50 artists/160 sections/369 concerts/1140 news items, without new fixtures. No worker restart or seven-day reset: original window 2 remained 48/48, cadenceIssues 0, partial 13, collecting until 12 Oct 06:00. Evidence: .local/auth-tests-2026-10-05*.log/auth-browser-2026-10-05.json/auth-deployment-2026-10-05.json.

Authorization integration for the current system is closed; UAT and actual VPS HTTPS/proxy/Secure-cookie checks remain planned. At the 18:42 authorization snapshot, next work was concert coverage/Instagram/original seven-day tracking, X/Facebook evidence, 9 pending rights-backed images, and membership/affiliation evidence. The 22:00 data results below reduce pending images to 2. UAT on 16–31 Jan and VPS/VPN/backup-restore before 15 Feb 2027 (B.E. 2570) remain pending.

## Data Completion and Figma Preparation — 5 Oct 2026 (B.E. 2569), 22:00

Added 7 of 9 pending rights-backed images: ATLAS, BUS, Dept, LOMOSONIC, KLEAR, NUM KALA, and URBOYTJ, totaling 48/50. Six use CC BY 4.0 interview frames stored in `apps/web/public/artist-images` with `ATTRIBUTION.md`; URBOYTJ uses a Commons CC BY-SA 4.0 image. All have creators, sources, licenses, and year/frame-extraction notes. Former members/presenters are not used to establish current rosters. MILLI/Only Monday still await rights evidence.

Imported membership/affiliation notes for 17 profiles, resolving public-evidence limitations for 4: Phum/Violette/Scrubb/Nene. Another 24 have specific issues requiring review. Added a Phum independent-work section, totaling 161 biography sections. Counts remain 50 profiles/7 relationships; this does not claim every management/recording contract is known.

`ArtistPortrait` is shared across artist pages and shows only images with credits matching their URL. Missing rights/broken URLs display placeholders while retaining available credit links. Added search/pagination/skip links/keyboard focus. Temporary colors/fonts/widths/radii are in `apps/web/app/design-tokens.css`. Required Figma pages/states are listed in the [15 Oct design handoff](./docs/figma-handoff-2026-10-15.md); the actual design has not arrived.

For an existing database, import with `docker compose run --rm --build seed`, then start API/web with `docker compose up -d --build --no-deps api web`. This round needs no new migration/environment variables or worker restart for data/web changes. It used a direct audit transaction without running the complete seed. Original worker boot 18:08:13 and monitor window 2 remain unchanged at 64/64/cadenceIssues 0, not yet seven days complete.

Typecheck/production build/Docker build passed; 164 server tests passed with 0 skipped, followed by 4 artist tests after the final 3 images. Chrome checked 50 profiles/48 credits/2 placeholders, decoding/contain/captions for 6 local frames, broken URLs/missing licenses, membership sources, and mobile 390px without overflows/page errors. [Full report and evidence](./docs/data-ui-acceptance-2026-10-05.md).

When preparing a new integration database, install extensions before running fixtures concurrently to avoid conflicting extension creation in temporary schemas (only use test databases with the required name prefixes):

```powershell
psql "$env:INGEST_TEST_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;"
psql "$env:BIOGRAPHY_TEST_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;"
npm test
```
