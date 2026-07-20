const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  isSafariBrowser,
  getSafariInstallPlatform,
  shouldEnablePullToRefresh,
  getPullHapticStep,
  getElasticPullDistance
} = require("../client/js/pwa");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("public and admin manifests have separate install identities", () => {
  const publicManifest = JSON.parse(read("manifest.webmanifest"));
  const adminManifest = JSON.parse(read("admin.webmanifest"));

  assert.equal(publicManifest.id, "/");
  assert.equal(publicManifest.start_url, "/");
  assert.equal(adminManifest.id, "/admin");
  assert.equal(adminManifest.start_url, "/admin");
  assert.equal(publicManifest.scope, "/");
  assert.equal(adminManifest.scope, "/admin");
  assert.equal(publicManifest.display, "standalone");
  assert.equal(adminManifest.display, "standalone");

  assert.ok(publicManifest.icons.every((icon) => !icon.src.includes("admin-")));
  assert.ok(adminManifest.icons.every((icon) => icon.src.includes("admin-")));

  for (const manifest of [publicManifest, adminManifest]) {
    assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
    assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
    assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  }
});

test("manual Safari installation is offered only on supported Apple targets", () => {
  const macSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
  const oldMacSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15";
  const macChrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  const iosSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

  assert.equal(getSafariInstallPlatform(macSafari, "MacIntel", 0), "mac");
  assert.equal(getSafariInstallPlatform(oldMacSafari, "MacIntel", 0), "");
  assert.equal(getSafariInstallPlatform(macChrome, "MacIntel", 0), "");
  assert.equal(getSafariInstallPlatform(iosSafari, "iPhone", 5), "ios");
  assert.equal(isSafariBrowser(macSafari), true);
  assert.equal(isSafariBrowser(iosSafari), true);
  assert.equal(isSafariBrowser(macChrome), false);
});

test("every public page loads the public PWA metadata and installer", () => {
  const publicPages = [
    "index.html",
    "news.html",
    "news-detail.html",
    "fan-zone.html",
    "hosts.html",
    "partners.html",
    "contact.html",
    "privacy.html",
    "cookies.html"
  ];

  for (const page of publicPages) {
    const html = read(page);
    assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(html, /pwa\.js\?v=/);
    assert.match(html, /apple-touch-icon/);
  }
});

test("admin page loads its own manifest and a capability-gated install button", () => {
  const html = read("admin.html");

  assert.match(html, /rel="manifest" href="\/admin\.webmanifest"/);
  assert.match(html, /href="\/admin\.webmanifest" crossorigin="use-credentials"/);
  assert.match(html, /apple-touch-icon[^>]+admin-apple-touch-icon\.png/);
  assert.match(html, /data-pwa-install-button[^>]*hidden/);
  assert.match(html, /admin-hero-topline/);
  assert.match(html, /class="pwa-install-button" data-pwa-install-button/);
  assert.match(html, /Добави админ приложение/);
  assert.match(html, /pwa\.js\?v=/);
});

test("server keeps the admin manifest private", () => {
  const server = read("server.js");

  assert.match(server, /url\.pathname === "\/admin\.webmanifest" && !isAuthenticated\(request\)/);
  assert.match(server, /return send\(response, 404, "Not found"/);
});

test("service worker bypasses private and dynamic routes", () => {
  const serviceWorker = read("sw.js");

  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/admin"\)/);
  assert.match(serviceWorker, /url\.pathname === "\/login"/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /caches\.match\(OFFLINE_URL\)/);
});

test("public policies disclose PWA storage and its exclusions", () => {
  const privacy = read("privacy.html");
  const cookies = read("cookies.html");

  for (const policy of [privacy, cookies]) {
    assert.match(policy, /Cache Storage/);
    assert.match(policy, /2026-07-20/);
    assert.match(policy, /админ/i);
    assert.match(policy, /Google Analytics/);
  }
});

test("cookie settings remain available when analytics is not configured", () => {
  const analytics = read("client/js/analytics.js");
  const styles = read("client/css/styles.css");

  assert.match(analytics, /Статистиката не е активна/);
  assert.match(analytics, /data-consent-close/);
  assert.doesNotMatch(styles, /analytics-disabled \[data-cookie-settings\]/);
});

test("public navigation and consent UI are compact on mobile", () => {
  const publicScript = read("client/js/script.js");
  const analytics = read("client/js/analytics.js");
  const styles = read("client/css/styles.css");

  assert.match(publicScript, /className = "nav-toggle"/);
  assert.match(publicScript, /aria-expanded/);
  assert.match(publicScript, /event\.key !== "Escape"/);
  assert.match(styles, /\.topbar\.is-nav-open \.nav/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /min-height: clamp\(510px, 70svh, 620px\)/);
  assert.doesNotMatch(styles, /\.subpage-hero \{ min-height: 100vh/);
  assert.match(analytics, /Помогни ни с анонимна статистика/);
  assert.match(styles, /width: min\(780px, calc\(100% - 32px\)\)/);
});

test("homepage promotes the prediction league only when visible matches exist", () => {
  const homepage = read("index.html");
  const publicScript = read("client/js/script.js");
  const styles = read("client/css/styles.css");

  assert.match(homepage, /data-home-league-promo[^>]*hidden/);
  assert.match(homepage, /href="\/fan-zone#prediction-league"/);
  assert.match(homepage, /data-home-league-cards/);
  assert.match(homepage, /Виж всички лиги/);
  assert.match(publicScript, /renderHomeLeaguePromo\(config\.predictionLeague\)/);
  assert.match(publicScript, /match\?\.enabled === false \|\| match\?\.result/);
  assert.match(publicScript, /kickoff > now/);
  assert.match(publicScript, /activeLeagues\.slice\(0, 3\)/);
  assert.match(publicScript, /home-league-card\$\{singleLeague/);
  assert.match(styles, /\.home-league-promo-grid/);
  assert.match(styles, /\.home-league-card/);
});

test("new prediction league recovery codes use a timed one-time modal", () => {
  const publicScript = read("client/js/script.js");
  const styles = read("client/css/styles.css");

  assert.match(publicScript, /const leagueRecoveryCloseDelay = 3/);
  assert.match(publicScript, /data-league-recovery-modal[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(publicScript, /след затваряне няма да можеш да видиш този код отново/);
  assert.match(publicScript, /data-close-recovery disabled/);
  assert.match(publicScript, /predictionLeagueRecoveryCode = ""/);
  assert.match(publicScript, /navigator\.clipboard\.writeText\(predictionLeagueRecoveryCode\)/);
  assert.match(publicScript, /data-close-recovery-backdrop/);
  assert.match(publicScript, /closeButtons\.forEach\(\(button\) => \{ button\.disabled = false; \}\)/);
  assert.doesNotMatch(styles, /body\.league-recovery-modal-open/);
  assert.match(styles, /\.league-recovery-close:disabled/);
  assert.match(styles, /\.league-recovery-dismiss/);
});

test("recognized league players can replace a lost recovery code", () => {
  const publicScript = read("client/js/script.js");
  const server = read("server.js");

  assert.match(publicScript, /Изгуби кода за възстановяване\?/);
  assert.match(publicScript, /data-league-rotate-recovery/);
  assert.match(publicScript, /\/api\/league\/recovery-code/);
  assert.match(publicScript, /Новият код за възстановяване е готов\. Старият вече не работи/);
  assert.match(server, /url\.pathname === "\/api\/league\/recovery-code"/);
  assert.match(server, /rotatePlayerRecoveryCode\(leagueStore, playerId, sessionSecret\)/);
});

test("prediction leagues share one profile but expose separate league selectors and admin editors", () => {
  const publicScript = read("client/js/script.js");
  const adminScript = read("client/js/admin.js");
  const adminHtml = read("admin.html");
  const server = read("server.js");

  assert.match(publicScript, /data-league-select/);
  assert.match(publicScript, /Създавам общ профил/);
  assert.match(publicScript, /selectedLeagueId/);
  assert.match(publicScript, /\/api\/league\/\$\{encodeURIComponent\(predictionLeagueState\.selectedLeagueId\)\}\/predictions/);
  assert.match(adminHtml, /data-add="league"/);
  assert.match(adminHtml, /id="league-list-editor"/);
  assert.match(adminScript, /normalizeAdminLeagueCollection/);
  assert.match(adminScript, /data-admin-league-select/);
  assert.match(server, /normalizeLeagueCollection\(content\.predictionLeague\)/);
});

test("league leaderboard exports a story card with rank, points, and the latest successful prediction", () => {
  const publicScript = read("client/js/script.js");
  const styles = read("client/css/styles.css");
  const fanZone = read("fan-zone.html");

  assert.match(publicScript, /data-league-share-achievement/);
  assert.match(publicScript, /shareLeagueAchievement\(predictionLeagueState, predictionLeaguePeriod\)/);
  assert.match(publicScript, /canvas\.width = 1080/);
  assert.match(publicScript, /canvas\.height = 1920/);
  assert.match(publicScript, /latestSuccessfulLeagueMatch/);
  assert.match(publicScript, /myPrediction\?\.scoring\?\.correctOutcome/);
  assert.match(publicScript, /МОЯТА ПОЗИЦИЯ/);
  assert.match(publicScript, /ПОСЛЕДЕН УСПЕХ/);
  assert.match(publicScript, /navigator\.canShare\?\.\(\{ files: \[file\] \}\)/);
  assert.match(styles, /\.league-leaderboard-share/);
  assert.match(publicScript, /leagueSelectedPeriod/);
  assert.match(publicScript, /selectedPeriod\.label/);
  assert.match(fanZone, /script\.js\?v=20260720-7/);
});

test("every news card exports a story-ready image with the article photo and a branded fallback", () => {
  const publicScript = read("client/js/script.js");
  const styles = read("client/css/styles.css");
  const news = read("news.html");

  assert.match(publicScript, /data-news-share/);
  assert.match(publicScript, /shareNewsItem\(item\)/);
  assert.match(publicScript, /newsExcerpt\(item, 180\)/);
  assert.match(publicScript, /new URL\("\/news", officialHomepageUrl\)/);
  assert.match(publicScript, /function createNewsStoryCanvas/);
  assert.match(publicScript, /function loadCanvasImage/);
  assert.match(publicScript, /drawCanvasCoverImage\(context, image/);
  assert.match(publicScript, /canvas\.width = 1080/);
  assert.match(publicScript, /canvas\.height = 1920/);
  assert.match(publicScript, /sharePngBlob\(blob/);
  assert.match(publicScript, /dis-news-\$\{filenamePart\}\.png/);
  assert.match(publicScript, /Story картата е свалена/);
  assert.match(publicScript, /focusSharedNewsCard\(newsGrid\)/);
  assert.match(publicScript, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(styles, /\.news-share-button/);
  assert.match(styles, /\.news-card\.is-shared-target/);
  assert.match(news, /script\.js\?v=20260720-7/);
});

test("share images release canvas memory and keep bounded reusable QR assets", () => {
  const publicScript = read("client/js/script.js");
  const pwa = read("client/js/pwa.js");
  const styles = read("client/css/styles.css");
  const serviceWorker = read("sw.js");

  assert.match(publicScript, /const shareQrCacheLimit = 6/);
  assert.match(publicScript, /function loadShareLogoImage/);
  assert.match(publicScript, /while \(shareQrAssets\.size > shareQrCacheLimit\)/);
  assert.match(publicScript, /function releaseShareAssetCache/);
  assert.match(publicScript, /if \(document\.hidden\) releaseShareAssetCache\(\)/);
  assert.match(publicScript, /function releaseCanvasMemory/);
  assert.match(publicScript, /canvas\.width = 1/);
  assert.match(publicScript, /canvas\.height = 1/);
  assert.match(publicScript, /image\.onload = null/);
  assert.match(publicScript, /if \(!canUseCursor\) return/);
  assert.match(pwa, /function isSafariBrowser/);
  assert.match(styles, /html\.safari-memory-optimized/);
  assert.match(styles, /html\.safari-memory-optimized \.football-cursor-trail/);
  assert.match(serviceWorker, /dis-pwa-v10/);
});

test("news listing stays compact and every article has a dedicated detail page", () => {
  const publicScript = read("client/js/script.js");
  const adminScript = read("client/js/admin.js");
  const styles = read("client/css/styles.css");
  const detailPage = read("news-detail.html");
  const server = read("server.js");

  assert.match(publicScript, /function newsDetailUrl/);
  assert.match(publicScript, /function renderNewsDetail/);
  assert.match(publicScript, /class="[^"]*news-read-button[^"]*"/);
  assert.match(publicScript, /item\.imageCaption/);
  assert.match(styles, /-webkit-line-clamp: 4/);
  assert.match(styles, /\.news-detail-article/);
  assert.match(styles, /\.news-detail-header h1[\s\S]*?white-space: normal/);
  assert.match(adminScript, /Кратко резюме за картата и Story share/);
  assert.match(adminScript, /Пълен текст на новината/);
  assert.match(adminScript, /class="mini-field readonly-field wide"/);
  assert.match(detailPage, /id="news-detail"/);
  assert.match(server, /newsDetailMatch/);
  assert.match(server, /renderNewsDetailHtml/);
  assert.match(server, /renderSitemap/);
});

test("API-Football logo search is protected, cached, selectable, and visible in league and poll UI", () => {
  const publicScript = read("client/js/script.js");
  const adminScript = read("client/js/admin.js");
  const predictionLeague = read("server/prediction-league.js");
  const server = read("server.js");
  const privacy = read("privacy.html");
  const cookies = read("cookies.html");

  assert.match(server, /\/api\/team-media\/search/);
  assert.match(server, /if \(!isAuthenticated\(request\)\)/);
  assert.match(server, /API_FOOTBALL_KEY/);
  assert.match(adminScript, /data-team-media-search/);
  assert.match(adminScript, /homeTeamMedia/);
  assert.match(adminScript, /optionMedia/);
  assert.match(predictionLeague, /homeTeamMedia: normalizeTeamMedia/);
  assert.match(publicScript, /teamIdentityMarkup\(match\.homeTeam, match\.homeTeamMedia/);
  assert.match(publicScript, /teamIdentityMarkup\(option\.label, option\.media\)/);
  assert.match(privacy, /API-Football/);
  assert.match(cookies, /media\.api-sports\.io/);
});

test("share images include branded dynamic QR codes for the exact intended destination", () => {
  const publicScript = read("client/js/script.js");
  const server = read("server.js");
  const packageJson = read("package.json");

  assert.match(publicScript, /officialHomepageUrl = "https:\/\/dis-podcast\.onrender\.com\/"/);
  assert.match(publicScript, /shareLogoAssetUrl = "\/assets\/pwa\/icon-192\.png"/);
  assert.match(publicScript, /\/api\/share-qr\?path=/);
  assert.match(publicScript, /loadShareQrAssets\("\/fan-zone"\)/);
  assert.match(publicScript, /loadShareQrAssets\(newsDetailUrl\(item\)\)/);
  assert.match(publicScript, /QR кодът не се зареди/);
  assert.match(server, /QRCode\.toBuffer/);
  assert.match(server, /Access-Control-Allow-Origin/);
  assert.match(server, /function shareQrTarget/);
  assert.match(packageJson, /"qrcode"/);
  assert.match(publicScript, /function drawShareQrBadge/);
  assert.match(publicScript, /context\.fillText\("SCAN ME"/);
  assert.match(publicScript, /drawShareQrBadge\(context, shareQrAssets, 770, 1570, 245\)/);
  assert.match(publicScript, /drawShareQrBadge\(context, shareQrAssets, 805, 1020, 210\)/);
  assert.match(publicScript, /drawShareQrBadge\(context, qrAssets, 770, 1568, 245\)/);
});

test("social previews are crawler-readable and nested news pages use root-relative assets", () => {
  const homepage = read("index.html");
  const news = read("news.html");
  const detail = read("news-detail.html");
  const robots = read("robots.txt");
  const publicScript = read("client/js/script.js");

  [homepage, news].forEach((page) => {
    assert.match(page, /property="og:image" content="https:\/\//);
    assert.match(page, /property="og:image:secure_url" content="https:\/\//);
    assert.match(page, /property="og:image:type" content="image\/png"/);
    assert.match(page, /name="twitter:card" content="summary_large_image"/);
  });
  assert.match(detail, /property="og:type" content="article"/);
  assert.match(detail, /__NEWS_IMAGE_TYPE__/);
  assert.match(detail, /assets\/news-football-hero\.png/);
  assert.match(publicScript, /`\/\$\{value\.replace\(\/\^\\\.\\\//);
  assert.match(publicScript, /dis-podcast\.onrender\.com\/news"/);
  assert.match(robots, /User-agent: facebookexternalhit\s+Allow: \//);
  assert.match(robots, /User-agent: Facebot\s+Allow: \//);
  assert.match(robots, /User-agent: meta-externalagent\s+Allow: \//);
  assert.match(robots, /User-agent: meta-externalfetcher\s+Allow: \//);
});

test("shared PWA script exposes an automatic offline status bar", () => {
  const pwa = read("client/js/pwa.js");
  const styles = read("client/css/styles.css");

  assert.match(pwa, /Офлайн режим — виждаш последно зареденото съдържание/);
  assert.match(pwa, /window\.addEventListener\("online"/);
  assert.match(pwa, /window\.addEventListener\("offline"/);
  assert.match(pwa, /!navigator\.onLine/);
  assert.match(styles, /\.pwa-offline-status/);
  assert.match(styles, /\.pwa-offline-status\[hidden\]/);
});

test("installed touch PWAs expose a guarded pull-to-refresh gesture", () => {
  const pwa = read("client/js/pwa.js");
  const styles = read("client/css/styles.css");
  const publicScript = read("client/js/script.js");
  const adminScript = read("client/js/admin.js");

  assert.equal(shouldEnablePullToRefresh(true, 5, false), true);
  assert.equal(shouldEnablePullToRefresh(true, 0, true), true);
  assert.equal(shouldEnablePullToRefresh(false, 5, true), false);
  assert.equal(shouldEnablePullToRefresh(true, 0, false), false);
  assert.equal(getPullHapticStep(0, 96), 0);
  assert.equal(getPullHapticStep(16, 96), 1);
  assert.equal(getPullHapticStep(48, 96), 3);
  assert.equal(getPullHapticStep(96, 96), 6);
  assert.ok(getElasticPullDistance(96) < 96);
  assert.ok(getElasticPullDistance(48) - getElasticPullDistance(0) > getElasticPullDistance(144) - getElasticPullDistance(96));

  assert.match(pwa, /display-mode: standalone/);
  assert.match(pwa, /navigator\.maxTouchPoints/);
  assert.match(pwa, /addEventListener\("touchstart"/);
  assert.match(pwa, /addEventListener\("touchmove"/);
  assert.match(pwa, /addEventListener\("touchend"/);
  assert.match(pwa, /navigator\.vibrate\(hapticStep === hapticSteps \? 18 : 6\)/);
  assert.match(pwa, /window\.DIS_PWA_REFRESH\(\)/);
  assert.doesNotMatch(pwa, /window\.location\.reload\(\)/);
  assert.match(pwa, /if \(refreshing\) \{\s*event\.preventDefault\(\)/);
  assert.match(pwa, /classList\.add\("pwa-refreshing"\)/);
  assert.match(pwa, /classList\.remove\("pwa-refreshing"\)/);
  assert.match(pwa, /if \(!navigator\.onLine\)/);
  assert.match(pwa, /Пусни за обновяване/);
  assert.match(styles, /\.pwa-pull-refresh/);
  assert.match(styles, /\.pwa-pull-refresh-content/);
  assert.match(pwa, /--pwa-content-pull-distance/);
  assert.match(styles, /\.pwa-pull-refresh\.is-refreshing/);
  assert.match(styles, /\.pwa-pull-refresh\.is-complete/);
  assert.match(styles, /html\.pwa-refreshing body/);
  assert.match(pwa, /const completeRefresh = \(\) =>/);
  assert.match(pwa, /window\.setTimeout\(\(\) => \{[\s\S]*setPullPosition\(0, true\)[\s\S]*\}, 180\)/);
  assert.match(styles, /clip-path: inset\(50%\)/);
  assert.match(styles, /overscroll-behavior-y: none/);
  assert.match(publicScript, /window\.DIS_PWA_REFRESH = \(\) => loadContent/);
  assert.match(adminScript, /window\.DIS_PWA_REFRESH = \(\) => loadAdminContent/);
  assert.match(publicScript, /cache: "no-store"/);
  assert.match(adminScript, /cache: "no-store"/);

  const indicatorStyles = styles.match(/\.pwa-pull-refresh \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(indicatorStyles, /right: 0/);
  assert.match(indicatorStyles, /left: 0/);
  assert.match(indicatorStyles, /margin-inline: auto/);
  assert.doesNotMatch(indicatorStyles, /translate3d\(-50%/);
});
