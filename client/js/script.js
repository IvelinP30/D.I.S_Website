let config = window.DIS_SITE_CONFIG || {};
let giveawayCountdownTimer = null;
let predictionLeagueState = null;
let predictionLeaguePeriod = "week";
let predictionLeagueRecoveryCode = "";
let predictionLeagueNotice = "";
let predictionLeagueFlashMatchId = "";
let predictionLeagueRecoveryTimer = null;
let engagementState = { news: {}, predictions: {} };
const newsReactionChoices = [
  { id: "top", emoji: "🔥", label: "Топ" },
  { id: "analysis", emoji: "👏", label: "Добър анализ" },
  { id: "controversial", emoji: "🤔", label: "Спорно" },
  { id: "more", emoji: "⚽", label: "Искам още" }
];
let predictionLeagueSelectedId = new URLSearchParams(window.location.search).get("league") || localStorage.getItem("dis-selected-league") || "";
const leagueRecoveryCloseDelay = 3;

function bindMainNavigation(mainNav) {
  const topbar = mainNav.closest(".topbar");
  if (!topbar || topbar.dataset.mobileNavigationBound === "true") return;
  topbar.dataset.mobileNavigationBound = "true";

  const toggle = document.createElement("button");
  toggle.className = "nav-toggle";
  toggle.type = "button";
  toggle.dataset.navToggle = "";
  toggle.setAttribute("aria-controls", mainNav.id || "main-nav");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Отвори меню");
  toggle.innerHTML = `
    <span aria-hidden="true"></span>
    <span aria-hidden="true"></span>
    <span aria-hidden="true"></span>`;
  topbar.insertBefore(toggle, mainNav);

  const closeNavigation = () => {
    topbar.classList.remove("is-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Отвори меню");
  };

  toggle.addEventListener("click", () => {
    const isOpen = !topbar.classList.contains("is-nav-open");
    topbar.classList.toggle("is-nav-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Затвори меню" : "Отвори меню");
  });

  mainNav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeNavigation();
  });

  document.addEventListener("click", (event) => {
    if (!topbar.contains(event.target)) closeNavigation();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !topbar.classList.contains("is-nav-open")) return;
    closeNavigation();
    toggle.focus({ preventScroll: true });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) closeNavigation();
  }, { passive: true });
}

function optimizeStaticAssetUrls(value) {
  if (Array.isArray(value)) return value.map(optimizeStaticAssetUrls);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, optimizeStaticAssetUrls(item)]));
  }
  if (typeof value !== "string") return value;
  const normalized = /^(?:\.\/)?(?:assets|uploads|client)\//.test(value)
    ? `/${value.replace(/^\.\//, "")}`
    : value;
  if (!normalized.includes("assets/") || normalized.endsWith("dis-logo.png")) return normalized;
  return normalized.replace(/\.png$/, ".webp");
}

async function loadContent({ allowFallback = true } = {}) {
  try {
    const response = await fetch("/api/content", {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error("Content API unavailable");
    config = optimizeStaticAssetUrls(await response.json());
  } catch (error) {
    if (!allowFallback) throw error;
    const savedConfig = localStorage.getItem("dis-site-config");
    if (savedConfig) config = optimizeStaticAssetUrls(JSON.parse(savedConfig));
  }

  config = optimizeStaticAssetUrls(config);

  if (document.querySelector("#news-detail, #news-grid, #prediction-grid")) {
    try {
      const response = await fetch("/api/engagement", { cache: "no-store", headers: { Accept: "application/json" } });
      if (response.ok) engagementState = await response.json();
    } catch {
      engagementState = { news: {}, predictions: {} };
    }
  }

  renderPage();
  bindPressNewsReveal();
  await renderPressNews();
  document.documentElement.classList.add("content-ready");
  await renderPredictionLeague();
  await renderFanVoting();
  bindGiveawayForm();
  bindGiveawayRulesLinks();
  bindMessageForms();
  bindMotion();
}

function renderPage() {
  const brand = config.brand || {};
  const hero = config.hero || {};
  const sections = config.sections || {};
  const sponsorPanel = config.sponsorPanel || {};
  const footer = config.footer || {};
  const brandName = brand.name || "D.I.S Подкаст";
  const logo = brand.logo || "./assets/dis-logo.png";
  const heroImage = brand.heroImage || "./assets/hero-football-podcast.webp";
  const contactEmail = footer.email || sections.contact?.email || "dispodcast10@gmail.com";

  const titleSuffix = {
    "/news": "Новини",
    "/fan-zone": "Фен зона",
    "/hosts": "Водещи",
    "/partners": "Партньорства",
    "/contact": "Контакт",
    "/privacy": "Политика за поверителност",
    "/cookies": "Политика за бисквитките"
  }[window.location.pathname];
  document.title = titleSuffix ? `${brandName} - ${titleSuffix}` : brandName;
  document.querySelectorAll(".brand-mark img").forEach((image) => {
    image.src = logo;
    image.alt = brandName;
  });
  document.querySelectorAll(".footer-logo").forEach((image) => {
    image.src = logo;
    image.alt = brandName;
  });
  setText("#header-brand-name", brandName);
  setText(".footer-brand-name", brandName);
  document.querySelectorAll(".footer-brand p").forEach((paragraph) => {
    paragraph.innerHTML = brandText(footer.description || "Футболни реакции, подкасти, live моменти и кратки видеа.");
  });
  setAttribute(".brand", "aria-label", `${brandName} начало`);
  setAttribute(".brand", "href", document.querySelector("#hero") ? "#hero" : "/");
  setAttribute('link[rel="icon"]', "href", logo);
  setAttribute(".hero-image", "src", heroImage);
  setAttribute(".hero-image", "alt", "hero background image");

  const mainNav = document.querySelector("#main-nav");
  const socialGrid = document.querySelector("#social-grid");
  const ticker = document.querySelector("#ticker");
  const formatGrid = document.querySelector("#format-grid");
  const statGrid = document.querySelector("#stat-grid");
  const adSlots = document.querySelector("#ad-slots");
  const activeAdMarquees = document.querySelectorAll("[data-active-ad-marquee]");
  const sponsorPackages = document.querySelector("#sponsor-packages");
  const youtubePlayer = document.querySelector("#youtube-player");
  const contactActions = document.querySelector("#contact-actions");
  const heroStack = document.querySelector("#hero-stack");
  const newsGrid = document.querySelector("#news-grid");
  const newsDetail = document.querySelector("#news-detail");
  const footerNav = document.querySelector("[data-footer-nav]");
  const footerSocials = document.querySelector("[data-footer-socials]");
  const footerEmail = document.querySelector("[data-footer-email]");
  const hostsGrid = document.querySelector("#hosts-grid");
  const predictionGrid = document.querySelector("#prediction-grid");
  const discoveryGrid = document.querySelector("#home-discovery-grid");
  const giveawaySection = document.querySelector("#giveaway");
  const featuredGiveaway = document.querySelector("[data-featured-giveaway]");
  const homeLeaguePromo = document.querySelector("[data-home-league-promo]");

  if (mainNav) {
    mainNav.innerHTML = (config.nav || [])
      .map((item) => {
        const href = item.href || "#";
        const pageHref = !document.querySelector("#hero") && href.startsWith("#") ? `/${href}` : href;
        const current = pageHref === window.location.pathname || (pageHref === "/" && window.location.pathname === "/");
        return `<a class="${current ? "is-current" : ""}" href="${escapeAttribute(pageHref)}">${escapeHTML(item.label || "")}</a>`;
      })
      .join("");
    bindMainNavigation(mainNav);
  }

  setHTML("#hero-eyebrow", brandText(hero.eyebrow || "Футбол. Реакции. Подкаст."));
  setHTML("#hero-title", brandText(hero.title || brandName));
  setHTML("#hero-copy", brandText(hero.copy || ""));
  setButton("#hero-primary", hero.primaryLabel || "Гледай в YouTube", hero.primaryUrl || "https://www.youtube.com/@dispodcastt");
  setButton("#hero-secondary", hero.secondaryLabel || "Виж партньорства", hero.secondaryUrl || "/partners");

  if (heroStack) {
    heroStack.innerHTML = (hero.chips || [])
      .map((item, index) => `<span class="mini-card" style="${getChipStyle(index)}">${escapeHTML(item)}</span>`)
      .join("");
  }

  setSection("socials", sections.socials);
  setSection("latest", sections.latest);
  setSection("news", sections.news);
  setAttribute("#news-hero-image", "src", sections.news?.image || "./assets/news-football-hero.webp");
  setAttribute("#news-hero-image", "alt", "hero background image");
  setSection("formats", sections.formats);
  setSection("discovery", sections.discovery);
  setSection("home-contact", sections.homeContact);
  setSection("sponsors", sections.sponsors);
  setSection("active-ads", sections.activeAds);
  setSection("stats", sections.mediaKit);
  setSection("contact", sections.contact);
  setHTML("#sponsor-panel-label", brandText(sponsorPanel.label || "Partner placement"));
  setHTML("#sponsor-panel-title", brandText(sponsorPanel.title || `Вашият бранд x ${brandName}`));
  setHTML("#sponsor-panel-description", brandText(sponsorPanel.description || ""));
  setAttribute("#sponsor-panel-image", "src", sponsorPanel.image || "./assets/partner-placement-football-media.webp");

  const pageHero = document.querySelector("[data-page-hero]");
  if (pageHero) {
    const page = config.pages?.[pageHero.dataset.pageHero] || {};
    setHTML("[data-page-kicker]", brandText(page.kicker || ""));
    setHTML("[data-page-title]", brandText(page.title || ""));
    setHTML("[data-page-description]", brandText(page.description || ""));
    setAttribute(".subpage-hero-image", "src", page.image || "./assets/hero-football-podcast.webp");
    setAttribute(".subpage-hero-image", "alt", "hero background image");
    document.querySelectorAll("[data-fan-copy]").forEach((element) => { element.innerHTML = brandText(page[element.dataset.fanCopy] || ""); });
    document.querySelectorAll("[data-hosts-copy]").forEach((element) => { element.innerHTML = brandText(page[element.dataset.hostsCopy] || ""); });
    document.querySelectorAll("[data-partners-copy]").forEach((element) => { element.innerHTML = brandText(page[element.dataset.partnersCopy] || ""); });
    document.querySelectorAll("[data-contact-copy]").forEach((element) => { element.innerHTML = brandText(page[element.dataset.contactCopy] || ""); });
  }

  if (ticker) {
    const tickerItems = [...(config.ticker || []), ...(config.ticker || [])];
    ticker.innerHTML = tickerItems.map((item) => `<span>${escapeHTML(item)}</span>`).join("");
  }

  if (socialGrid) {
    socialGrid.innerHTML = (config.socials || [])
      .map(
        (item) => `
          <a class="social-card tilt-card" href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">
            <span class="social-top">
              <span>
                <small>${escapeHTML(item.handle)}</small>
                <h3>${escapeHTML(item.name)}</h3>
              </span>
              <span class="social-icon ${getPlatformClass(item.name)}" aria-hidden="true">${getPlatformIcon(item.name)}</span>
            </span>
            <p>${brandText(item.label)}</p>
          </a>
        `
      )
      .join("");
  }

  if (youtubePlayer) {
    const player = config.youtubePlayer || {};
    const embedUrl = getYouTubeEmbedUrl(player.url);
    youtubePlayer.innerHTML = `
      <div class="youtube-frame">
        ${
          embedUrl
            ? `<iframe src="${escapeAttribute(embedUrl)}" title="${escapeAttribute(player.title || `${brandName} YouTube video`)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
            : `<a class="youtube-placeholder" href="${escapeAttribute(player.url || "https://www.youtube.com/@dispodcastt")}" target="_blank" rel="noreferrer">Отвори YouTube канала</a>`
        }
      </div>
      <div class="youtube-copy">
        <small>YouTube player</small>
        <h3>${brandText(player.title || `Последно видео от ${brandName}`)}</h3>
        <p>${brandText(player.description || "Най-актуалният YouTube акцент от канала.")}</p>
      </div>
    `;
  }

  if (formatGrid) {
    formatGrid.innerHTML = (config.formats || [])
      .map(
        (format) => `
          <article class="format-card tilt-card">
            <span class="format-number">${escapeHTML(format.number)}</span>
            <h3>${brandText(format.title)}</h3>
            <p>${brandText(format.description)}</p>
            ${format.items?.length ? `<ul>${format.items.map((item) => `<li>${brandText(item)}</li>`).join("")}</ul>` : ""}
          </article>
        `
      )
      .join("");
  }

  if (discoveryGrid) {
    const cards = [
      { key: "fanZone", href: "/fan-zone", label: "Гласувай", fallback: "Фен зона" },
      { key: "hosts", href: "/hosts", label: "Запознай се", fallback: "Водещи" },
      { key: "news", href: "/news", label: "Прочети", fallback: "Новини", section: sections.news },
      { key: "partners", href: "/partners", label: "Разгледай", fallback: "Партньорства" }
    ];
    discoveryGrid.innerHTML = cards.map((card) => {
      const page = card.section || config.pages?.[card.key] || {};
      return `
        <a class="discovery-card tilt-card" href="${card.href}">
          <img src="${escapeAttribute(page.image || "./assets/news-football-hero.webp")}" alt="" />
          <span class="discovery-card-overlay"></span>
          <span class="discovery-card-copy"><small>${escapeHTML(page.kicker || card.fallback)}</small><strong>${brandText(page.title || card.fallback)}</strong><em>${card.label}</em></span>
        </a>`;
    }).join("");
  }

  if (hostsGrid) {
    hostsGrid.innerHTML = (config.hosts || []).length
      ? config.hosts.map((host, index) => `
          <article class="host-card tilt-card ${host.imageUrl ? "has-image" : "no-image"}">
            ${host.imageUrl ? `<img class="host-photo" src="${escapeAttribute(host.imageUrl)}" alt="${escapeAttribute(host.name || "Водещ")}" />` : ""}
            <div class="host-content">
              <span class="host-number">0${index + 1}</span>
              <small>${escapeHTML(host.role || "Водещ")}</small>
              <h2>${escapeHTML(host.name || "Водещ")}</h2>
              <p>${brandText(host.bio || "")}</p>
              <dl>
                ${host.favoriteTeam ? `<div><dt>Любим отбор</dt><dd>${escapeHTML(host.favoriteTeam)}</dd></div>` : ""}
                ${host.favoritePlayer ? `<div><dt>Любим играч</dt><dd>${escapeHTML(host.favoritePlayer)}</dd></div>` : ""}
                ${host.footballMemory ? `<div><dt>Футболен момент</dt><dd>${escapeHTML(host.footballMemory)}</dd></div>` : ""}
                ${host.matchStyle ? `<div><dt>Гледна точка</dt><dd>${escapeHTML(host.matchStyle)}</dd></div>` : ""}
              </dl>
            </div>
          </article>`).join("")
      : `<article class="empty-state">Профилите на водещите ще се появят тук.</article>`;
  }

  if (predictionGrid) {
    predictionGrid.innerHTML = (config.predictions || []).length
      ? config.predictions.map((item) => renderHostPrediction(item, engagementState.predictions?.[item.id])).join("")
      : `<article class="empty-state">Очаквай следващите прогнози на водещите.</article>`;
    bindPredictionVotes(predictionGrid);
  }

  if (giveawaySection) renderGiveaway(config.giveaway);
  if (featuredGiveaway) renderFeaturedGiveaway(config.giveaway);
  if (homeLeaguePromo) renderHomeLeaguePromo(config.predictionLeague);
  if ((giveawaySection || featuredGiveaway) && giveawayIsActive(config.giveaway)) {
    loadGiveawayPublicStatus(config.giveaway);
    startGiveawayCountdown(config.giveaway);
  }

  if (newsGrid) {
    const newsItems = [...(config.news || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    newsGrid.innerHTML = newsItems.length
      ? newsItems.map((item, index) => renderNewsCard(item, index)).join("")
      : `<article class="empty-state">Все още няма добавени новини.</article>`;
    bindNewsShareActions(newsGrid, newsItems);
    bindNewsCardReactions(newsGrid);
    focusSharedNewsCard(newsGrid);
  }
  if (newsDetail) renderNewsDetail(newsDetail);

  if (statGrid) {
    statGrid.innerHTML = (config.stats || [])
      .map(
        (stat) => `
          <article class="stat-card tilt-card">
            <strong data-count="${Number(stat.value) || 0}">0</strong><span>${escapeHTML(stat.suffix || "")}</span>
            <h3>${brandText(stat.label)}</h3>
            <p>${brandText(stat.note)}</p>
            ${stat.source ? `<small>${brandText(stat.source)}</small>` : ""}
          </article>
        `
      )
      .join("");
  }

  if (adSlots) {
    adSlots.innerHTML = (config.adSlots || [])
      .map(
        (slot) => `
          <article class="ad-card tilt-card">
            <small>${escapeHTML(slot.format)}</small>
            <h3>${brandText(slot.title)}</h3>
            <p>${brandText(slot.description)}</p>
          </article>
        `
      )
      .join("");
  }

  if (activeAdMarquees.length) {
    const activeAds = config.activeAds || [];
    activeAdMarquees.forEach((marquee) => {
      marquee.closest(".ad-marquee-section").hidden = activeAds.length === 0;
      marquee.innerHTML = activeAds.length ? renderActiveAdMarquee(activeAds) : "";
    });
  }

  if (sponsorPackages) {
    sponsorPackages.innerHTML = (config.sponsorPackages || [])
      .map(
        (pack) => `
          <article class="package-card tilt-card ${pack.recommended ? "is-recommended" : ""}">
            ${
              pack.recommended
                ? `<span class="recommended-badge"><strong>Best choice</strong><em>най-добър баланс</em></span>`
                : ""
            }
            <small>${escapeHTML(pack.price)}</small>
            <h3>${brandText(pack.name)}</h3>
            <ul>${pack.items.map((item) => `<li>${brandText(item)}</li>`).join("")}</ul>
          </article>
        `
      )
      .join("");
  }

  if (contactActions) {
    contactActions.innerHTML = [
      contactEmail
        ? `
          <a class="button contact-button email-button secondary" href="mailto:${escapeAttribute(contactEmail)}">
            <span class="contact-icon platform-email">${getPlatformIcon("email")}</span>
            <span>${escapeHTML(contactEmail)}</span>
          </a>
        `
        : "",
      ...(config.socials || [])
      .map(
        (item, index) => `
          <a class="button contact-button secondary" href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">
            <span class="contact-icon ${getPlatformClass(item.name)}">${getPlatformIcon(item.name)}</span>
            <span>${escapeHTML(item.name)}</span>
          </a>
        `
      )
    ].join("");
  }

  if (footerNav) {
    footerNav.innerHTML = (footer.links || config.nav || [])
      .map((item) => {
        const href = item.href || "#";
        const pageHref = !document.querySelector("#hero") && href.startsWith("#") ? `/${href}` : href;
        const current = pageHref === window.location.pathname || (pageHref === "/" && window.location.pathname === "/");
        return `<a class="${current ? "is-current" : ""}" href="${escapeAttribute(pageHref)}">${escapeHTML(item.label || "")}</a>`;
      })
      .join("");
  }

  if (footerEmail) {
    footerEmail.hidden = !contactEmail;
    footerEmail.href = `mailto:${contactEmail}`;
    footerEmail.innerHTML = `
      <span class="contact-icon platform-email">${getPlatformIcon("email")}</span>
      <span>${escapeHTML(contactEmail)}</span>
    `;
  }

  if (footerSocials) {
    footerSocials.innerHTML = (footer.socials || config.socials || [])
      .map(
        (item) => `
          <a class="footer-social-link ${getPlatformClass(item.name)}" href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer" aria-label="${escapeAttribute(item.name)}">
            ${getPlatformIcon(item.name)}
          </a>
        `
      )
      .join("");
  }

  renderLegalFooter(brandName);
}

async function leagueApi(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Заявката към Лигата на прогнозите не успя.");
  return payload;
}

function leagueApiUrl(path, leagueId = predictionLeagueState?.selectedLeagueId || predictionLeagueSelectedId) {
  if (!leagueId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}league=${encodeURIComponent(leagueId)}`;
}

const leagueTrophyTierOrder = Object.freeze({ bronze: 1, silver: 2, gold: 3, platinum: 4, legendary: 5 });
let leagueTrophyTooltip = null;
let leagueTrophyGlobalEventsBound = false;
let leagueTrophyActiveTrigger = null;
let leagueTrophyPinnedTrigger = null;
let leagueTrophyHoverTimer = null;
let leaguePlayerTooltip = null;
let leaguePlayerGlobalEventsBound = false;
let leaguePlayerActiveTrigger = null;
let leaguePlayerPinnedTrigger = null;
let leaguePlayerHoverTimer = null;
const leagueTooltipHoverDelay = 280;

function leaguePrimaryBadge(badges = []) {
  return [...badges].sort((left, right) => (leagueTrophyTierOrder[right.tier] || 0) - (leagueTrophyTierOrder[left.tier] || 0))[0];
}

function leagueBadgeMarkup(badge = {}, compact = false) {
  const tier = leagueTrophyTierOrder[badge.tier] ? badge.tier : "bronze";
  const label = badge.label || "Трофей";
  const description = badge.description || "Спечелен трофей в Лигата на прогнозите.";
  const tierLabel = badge.tierLabel || "Бронзово";
  return `<span class="league-badge tier-${tier} ${compact ? "is-compact" : ""}" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false" data-league-trophy data-trophy-label="${escapeAttribute(label)}" data-trophy-description="${escapeAttribute(description)}" data-trophy-tier="${escapeAttribute(tierLabel)}" aria-label="${escapeAttribute(`${label}. ${description} Ниво: ${tierLabel}.`)}"><i aria-hidden="true"></i><span>${escapeHTML(label)}</span></span>`;
}

function leagueBadgeDisplayMarkup(badge = {}) {
  const tier = leagueTrophyTierOrder[badge.tier] ? badge.tier : "bronze";
  const label = badge.label || "Трофей";
  return `<span class="league-badge tier-${tier}" aria-label="${escapeAttribute(label)}"><i aria-hidden="true"></i><span>${escapeHTML(label)}</span></span>`;
}

const leagueLevelTierStarts = Object.freeze({ starter: 1, bronze: 5, silver: 10, gold: 20, platinum: 30, diamond: 40, legendary: 50 });
const leagueLevelColors = Object.freeze({
  starter: "#6fcf8b",
  bronze: "#df9a62",
  silver: "#dce8f5",
  gold: "#f4d44d",
  platinum: "#64dcff",
  diamond: "#9b8cff",
  legendary: "#df9cff"
});
let leagueLevelSvgSequence = 0;
const leagueLevelFramePaths = Object.freeze({
  starter: "M50 5 A45 45 0 1 1 49.9 5 Z",
  bronze: "M28 6 L72 6 L94 28 L94 72 L72 94 L28 94 L6 72 L6 28 Z",
  silver: "M50 4 L87 16 L93 48 Q91 80 50 97 Q9 80 7 48 L13 16 Z",
  gold: "M50 3 L78 11 L96 35 L90 72 L70 92 L50 99 L30 92 L10 72 L4 35 L22 11 Z",
  platinum: "M50 2 L73 8 L94 26 L98 53 L84 80 L50 99 L16 80 L2 53 L6 26 L27 8 Z",
  diamond: "M50 1 L66 10 L82 7 L91 24 L99 50 L90 76 L74 93 L50 99 L26 93 L10 76 L1 50 L9 24 L18 7 L34 10 Z",
  legendary: "M50 1 L62 12 L81 6 L86 26 L99 50 L86 74 L94 94 L72 87 L50 99 L28 87 L6 94 L14 72 L1 50 L14 28 L6 6 L38 12 Z"
});

function leagueLevelVisual(level = {}) {
  const value = Math.max(1, Number(level.value) || 1);
  const tiers = new Set(Object.keys(leagueLevelTierStarts));
  const tier = tiers.has(level.tier) ? level.tier : "starter";
  const tierStep = Math.max(1, value - leagueLevelTierStarts[tier] + 1);
  return {
    value,
    tier,
    tierStep,
    ornamentCount: ((tierStep - 1) % 5) + 1,
    ornamentBand: Math.min(3, Math.floor((tierStep - 1) / 5)),
    framePath: leagueLevelFramePaths[tier]
  };
}

function leagueLevelSvgMarkup(visual) {
  const progressX = [32, 41, 50, 59, 68].slice(0, visual.ornamentCount);
  const progressMarks = progressX.map((x) => {
    if (visual.tier === "starter") return `<path d="M${x - 3} 91 Q${x} 88 ${x + 3} 91"></path>`;
    if (visual.tier === "bronze") return `<rect x="${x - 2.5}" y="88.5" width="5" height="5" rx=".8" transform="rotate(45 ${x} 91)"></rect>`;
    if (visual.tier === "silver") return `<path d="M${x} 86.5 L${x + 1.4} 89.4 L${x + 4.4} 89.8 L${x + 2.1} 91.9 L${x + 2.8} 95 L${x} 93.3 L${x - 2.8} 95 L${x - 2.1} 91.9 L${x - 4.4} 89.8 L${x - 1.4} 89.4 Z"></path>`;
    if (visual.tier === "gold") return `<path d="M${x} 85 L${x + 1.8} 89 L${x + 6} 89.4 L${x + 2.8} 92.2 L${x + 3.8} 96.5 L${x} 94 L${x - 3.8} 96.5 L${x - 2.8} 92.2 L${x - 6} 89.4 L${x - 1.8} 89 Z"></path>`;
    if (visual.tier === "platinum") return `<polygon points="${x},85.5 ${x + 4.8},91 ${x},96.5 ${x - 4.8},91"></polygon><path d="M${x} 85.5 L${x} 96.5 M${x - 4.8} 91 L${x + 4.8} 91"></path>`;
    if (visual.tier === "diamond") return `<polygon points="${x},84 ${x + 5.2},89 ${x + 3.2},96 ${x - 3.2},96 ${x - 5.2},89"></polygon><path d="M${x - 5.2} 89 L${x + 5.2} 89 M${x} 84 L${x - 3.2} 96 M${x} 84 L${x + 3.2} 96"></path>`;
    return `<path d="M${x} 96 Q${x - 5} 91 ${x} 84 Q${x + 5} 91 ${x} 96 Z M${x} 93 Q${x - 2} 90 ${x} 87 Q${x + 2} 90 ${x} 93 Z"></path>`;
  }).join("");
  const bandOne = visual.ornamentBand >= 1
    ? `<path d="M20 29 Q4 20 -7 34 L5 47 L-9 56 Q4 71 24 67 L31 47 Z"></path><path d="M80 29 Q96 20 107 34 L95 47 L109 56 Q96 71 76 67 L69 47 Z"></path><path class="level-svg-feather" d="M-2 35 L23 42 M-5 55 L23 54 M2 65 L24 60 M102 35 L77 42 M105 55 L77 54 M98 65 L76 60"></path>`
    : "";
  const bandTwo = visual.ornamentBand >= 2
    ? `<path d="M17 25 Q0 20 -7 39 Q6 36 20 47 L27 34 Z"></path><path d="M83 25 Q100 20 107 39 Q94 36 80 47 L73 34 Z"></path><path d="M28 94 L72 94 L65 104 L35 104 Z"></path><path class="level-svg-feather" d="M-1 32 L18 35 M4 27 L21 31 M101 32 L82 35 M96 27 L79 31"></path>`
    : "";
  const bandThree = visual.ornamentBand >= 3
    ? `<path d="M32 10 L37 -5 L48 5 L50 -8 L52 5 L63 -5 L68 10 L58 16 L42 16 Z"></path><circle cx="50" cy="-1" r="3"></circle>`
    : "";
  const phaseArt = `${visual.ornamentCount >= 2 ? `<path class="level-svg-phase-fill" d="M27 93 L73 93 L66 107 L34 107 Z"></path>` : ""}${visual.ornamentCount >= 3 ? `<path class="level-svg-phase-fill" d="M13 31 L-8 45 L4 63 L21 51 Z"></path><path class="level-svg-phase-fill" d="M87 31 L108 45 L96 63 L79 51 Z"></path>` : ""}${visual.ornamentCount >= 4 ? `<path class="level-svg-phase-fill" d="M34 10 L50 -9 L66 10 L58 20 L42 20 Z"></path>` : ""}${visual.ornamentCount >= 5 ? `<path class="level-svg-phase-rail" d="${visual.framePath}" transform="translate(50 50) scale(1.13) translate(-50 -50)"></path>` : ""}`;
  const tierMotifs = {
    starter: `<g class="level-svg-training-ball"><path d="M50 24 L62 33 L58 47 L42 47 L38 33 Z"></path><path d="M38 33 L25 31 L19 43 L29 54 L42 47 M62 33 L75 31 L81 43 L71 54 L58 47 M29 54 L28 69 L41 77 L50 66 L42 47 M71 54 L72 69 L59 77 L50 66 L58 47"></path><path class="level-svg-stitches" d="M31 25 L34 28 M23 36 L27 38 M20 51 L24 51 M27 64 L31 62 M69 25 L66 28 M77 36 L73 38 M80 51 L76 51 M73 64 L69 62"></path><path class="level-svg-leather-grain" d="M17 27 L22 24 M79 24 L84 28 M15 60 L20 63 M80 63 L85 60 M35 80 L39 83 M61 83 L65 80"></path></g>`,
    bronze: `<g class="level-svg-rivets"><circle cx="23" cy="27" r="2.5"></circle><circle cx="77" cy="27" r="2.5"></circle><circle cx="23" cy="73" r="2.5"></circle><circle cx="77" cy="73" r="2.5"></circle></g><g class="level-svg-leather"><path d="M18 33 L30 21 M16 48 L39 25 M16 64 L27 53 M82 33 L70 21 M84 48 L61 25 M84 64 L73 53"></path><path class="level-svg-stitches" d="M31 12 L34 16 M42 10 L43 15 M58 10 L57 15 M69 12 L66 16"></path></g><path class="level-svg-plate" d="M28 78 L72 78 L64 89 L36 89 Z"></path>`,
    silver: `<g class="level-svg-laurel"><path d="M23 70 Q8 50 20 27 M18 61 L9 56 M16 52 L7 46 M18 42 L10 35 M22 33 L17 24"></path><path d="M77 70 Q92 50 80 27 M82 61 L91 56 M84 52 L93 46 M82 42 L90 35 M78 33 L83 24"></path></g><path class="level-svg-crown" d="M41 14 L50 2 L59 14 L50 20 Z"></path><path class="level-svg-metal-cut" d="M32 23 L40 29 M68 23 L60 29 M22 75 L34 68 M78 75 L66 68"></path>`,
    gold: `<path class="level-svg-crown" d="M31 17 L37 1 L50 12 L63 1 L69 17 L58 23 L42 23 Z"></path><path class="level-svg-gold-star" d="M50 24 L54 34 L65 35 L56 42 L59 53 L50 47 L41 53 L44 42 L35 35 L46 34 Z"></path><g class="level-svg-gold-wings"><path d="M31 37 Q17 26 8 34 L26 45 L9 43 Q14 58 31 57"></path><path d="M69 37 Q83 26 92 34 L74 45 L91 43 Q86 58 69 57"></path><path d="M14 35 L28 43 M13 48 L29 51 M86 35 L72 43 M87 48 L71 51"></path></g>`,
    platinum: `<path class="level-svg-crystal" d="M50 3 L63 17 L56 32 L44 32 L37 17 Z"></path><g class="level-svg-facets"><polygon points="17,36 31,24 36,44 23,55"></polygon><polygon points="83,36 69,24 64,44 77,55"></polygon><polygon points="22,68 36,57 42,75 30,84"></polygon><polygon points="78,68 64,57 58,75 70,84"></polygon></g><g class="level-svg-rays"><path d="M25 24 L11 11 M75 24 L89 11 M17 50 L1 50 M83 50 L99 50 M29 80 L18 91 M71 80 L82 91"></path></g>`,
    diamond: `<path class="level-svg-diamond" d="M50 1 L64 17 L57 34 L43 34 L36 17 Z"></path><g class="level-svg-diamond-wings"><path d="M35 35 L16 20 L5 39 L24 50 L7 58 L27 72 L40 55 Z"></path><path d="M65 35 L84 20 L95 39 L76 50 L93 58 L73 72 L60 55 Z"></path><path d="M16 20 L24 50 L7 58 M84 20 L76 50 L93 58"></path></g><path class="level-svg-diamond-base" d="M31 78 L50 92 L69 78 L61 94 L39 94 Z"></path>`,
    legendary: `<path class="level-svg-crown" d="M25 20 L32 -1 L47 12 L50 -7 L53 12 L68 -1 L75 20 L61 28 L39 28 Z"></path><g class="level-svg-flames"><path d="M22 76 Q-2 57 15 25 Q13 48 30 43 Q19 59 32 70"></path><path d="M78 76 Q102 57 85 25 Q87 48 70 43 Q81 59 68 70"></path></g><path class="level-svg-trophy" d="M39 69 Q50 79 61 69 L58 82 L68 87 L65 92 L35 92 L32 87 L42 82 Z"></path>`
  };
  const svgId = `dis-level-${visual.tier}-${visual.value}-${++leagueLevelSvgSequence}`;
  const tierColor = leagueLevelColors[visual.tier];
  return `<svg class="league-level-svg" viewBox="-10 -10 120 120" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${svgId}-frame" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".48"></stop>
        <stop offset=".2" stop-color="${tierColor}" stop-opacity=".78"></stop>
        <stop offset=".56" stop-color="#05090d" stop-opacity=".95"></stop>
        <stop offset="1" stop-color="${tierColor}" stop-opacity=".58"></stop>
      </linearGradient>
      <radialGradient id="${svgId}-core" cx=".36" cy=".28" r=".78">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".22"></stop>
        <stop offset=".34" stop-color="#101921" stop-opacity=".96"></stop>
        <stop offset="1" stop-color="#020507"></stop>
      </radialGradient>
    </defs>
    <g class="level-svg-band-art">${bandOne}${bandTwo}${bandThree}</g>
    <g class="level-svg-phase-art">${phaseArt}</g>
    <path class="level-svg-energy" d="${visual.framePath}" transform="translate(50 50) scale(1.07) translate(-50 -50)"></path>
    <path class="level-svg-aura" d="${visual.framePath}"></path>
    <path class="level-svg-frame-back" d="${visual.framePath}"></path>
    <path class="level-svg-frame" d="${visual.framePath}" style="fill:url(#${svgId}-frame)"></path>
    <path class="level-svg-frame-inner" d="${visual.framePath}" transform="translate(50 50) scale(.79) translate(-50 -50)"></path>
    <circle class="level-svg-core" cx="50" cy="50" r="29" style="fill:url(#${svgId}-core)"></circle>
    <path class="level-svg-shine" d="M29 39 Q50 19 71 39"></path>
    <path class="level-svg-sheen" d="M12 86 L88 14"></path>
    ${tierMotifs[visual.tier]}
    <circle class="level-svg-number-plate" cx="50" cy="50" r="18"></circle>
    <g class="level-svg-progress">${progressMarks}</g>
  </svg>`;
}

function leagueLevelMarkup(level = {}, compact = false) {
  const visual = leagueLevelVisual(level);
  const levelName = level.name || level.tierLabel || "Дебютант";
  return `<span class="league-level tier-${visual.tier} level-band-${visual.ornamentBand} ${compact ? "is-compact" : ""}" aria-label="Ниво ${visual.value}, ${escapeAttribute(levelName)}">${leagueLevelSvgMarkup(visual)}<b>${visual.value}</b></span>`;
}

function leagueHostBadgeMarkup(compact = false) {
  return `<span class="league-host-badge ${compact ? "is-compact" : ""}"><i aria-hidden="true">◆</i>D.I.S Водещ</span>`;
}

function leagueRankLabel(value) {
  return value ? `#${value}` : "—";
}

function hideLeaguePlayerTooltip() {
  window.clearTimeout(leaguePlayerHoverTimer);
  leaguePlayerHoverTimer = null;
  leaguePlayerActiveTrigger?.setAttribute("aria-expanded", "false");
  leaguePlayerActiveTrigger = null;
  leaguePlayerPinnedTrigger = null;
  if (!leaguePlayerTooltip) return;
  leaguePlayerTooltip.classList.remove("is-visible");
  leaguePlayerTooltip.setAttribute("aria-hidden", "true");
}

function showLeaguePlayerTooltip(trigger, { pinned = false } = {}) {
  window.clearTimeout(leaguePlayerHoverTimer);
  leaguePlayerHoverTimer = null;
  if (leaguePlayerActiveTrigger && leaguePlayerActiveTrigger !== trigger) {
    leaguePlayerActiveTrigger.setAttribute("aria-expanded", "false");
  }
  leaguePlayerActiveTrigger = trigger;
  if (pinned) leaguePlayerPinnedTrigger = trigger;
  trigger.setAttribute("aria-expanded", "true");
  leaguePlayerTooltip ||= Object.assign(document.createElement("div"), { className: "league-player-tooltip" });
  if (!leaguePlayerTooltip.isConnected) {
    leaguePlayerTooltip.setAttribute("role", "tooltip");
    document.body.appendChild(leaguePlayerTooltip);
  }
  const data = trigger.dataset;
  leaguePlayerTooltip.innerHTML = `
    <div class="league-player-tooltip-heading">
      ${leagueLevelMarkup({ value: data.level, name: data.levelName, tier: data.levelTier, tierLabel: data.levelTierLabel })}
      <div><span>Ниво ${escapeHTML(data.level)}</span><strong>${escapeHTML(data.nickname)}</strong><small>${escapeHTML(data.levelName || data.levelTierLabel)}</small>${data.isHost === "true" ? leagueHostBadgeMarkup(true) : ""}</div>
    </div>
    ${data.trophyLabel ? `<div class="league-player-tooltip-trophy">${leagueBadgeDisplayMarkup({ label: data.trophyLabel, tier: data.trophyTier })}<small>${escapeHTML(data.trophyDescription)}</small></div>` : ""}
    <div class="league-player-tooltip-ranks">
      <span><b>${escapeHTML(leagueRankLabel(Number(data.rankWeek) || null))}</b>седмица</span>
      <span><b>${escapeHTML(leagueRankLabel(Number(data.rankMonth) || null))}</b>месец</span>
      <span><b>${escapeHTML(leagueRankLabel(Number(data.rankSeason) || null))}</b>D.I.S сезон</span>
    </div>
    <div class="league-player-tooltip-stats">
      <span><b>${escapeHTML(data.currentStreak)}</b>текуща серия</span>
      <span><b>${escapeHTML(data.exactScores)}</b>точни резултати</span>
      <span><b>${escapeHTML(data.correctOutcomes)}</b>познати мачове</span>
      <span><b>${escapeHTML(data.globalMatches)}</b>общо участия</span>
      <span><b>${escapeHTML(data.leagueMatches)}</b>в тази лига</span>
    </div>
    <div class="league-player-tooltip-progress"><span style="width:${Math.max(0, Math.min(100, Number(data.levelProgress) || 0))}%"></span></div>
    <small class="league-player-tooltip-next">Остават ${escapeHTML(data.matchesToNext)} ${Number(data.matchesToNext) === 1 ? "мач" : "мача"} до ниво ${Number(data.level) + 1}</small>`;
  leaguePlayerTooltip.setAttribute("aria-hidden", "false");
  leaguePlayerTooltip.style.left = "0px";
  leaguePlayerTooltip.style.top = "0px";
  leaguePlayerTooltip.classList.add("is-visible");
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = leaguePlayerTooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - tooltipRect.width - 10, Math.max(10, triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2));
  const preferredTop = triggerRect.top - tooltipRect.height - 10;
  const top = preferredTop >= 10 ? preferredTop : Math.min(window.innerHeight - tooltipRect.height - 10, triggerRect.bottom + 10);
  leaguePlayerTooltip.style.left = `${left}px`;
  leaguePlayerTooltip.style.top = `${Math.max(10, top)}px`;
}

function bindLeaguePlayerTooltips(app) {
  app.querySelectorAll("[data-league-player]").forEach((trigger) => {
    trigger.addEventListener("mouseenter", () => {
      if (leaguePlayerPinnedTrigger) return;
      window.clearTimeout(leaguePlayerHoverTimer);
      leaguePlayerHoverTimer = window.setTimeout(() => {
        if (trigger.matches(":hover") && !leaguePlayerPinnedTrigger) showLeaguePlayerTooltip(trigger);
      }, leagueTooltipHoverDelay);
    });
    trigger.addEventListener("mouseleave", () => {
      if (!leaguePlayerPinnedTrigger) hideLeaguePlayerTooltip();
    });
    trigger.addEventListener("focus", () => showLeaguePlayerTooltip(trigger));
    trigger.addEventListener("blur", () => {
      if (!leaguePlayerPinnedTrigger) hideLeaguePlayerTooltip();
    });
    trigger.addEventListener("click", () => {
      if (leaguePlayerPinnedTrigger === trigger) hideLeaguePlayerTooltip();
      else showLeaguePlayerTooltip(trigger, { pinned: true });
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      trigger.click();
    });
  });
  if (!app.dataset.playerTooltipBound) {
    app.addEventListener("scroll", hideLeaguePlayerTooltip, true);
    app.dataset.playerTooltipBound = "true";
  }
  if (!leaguePlayerGlobalEventsBound) {
    window.addEventListener("resize", hideLeaguePlayerTooltip);
    document.addEventListener("pointerdown", (event) => {
      if (leaguePlayerPinnedTrigger && !event.target.closest?.("[data-league-player]")) hideLeaguePlayerTooltip();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideLeaguePlayerTooltip();
    });
    leaguePlayerGlobalEventsBound = true;
  }
}

function hideLeagueTrophyTooltip() {
  window.clearTimeout(leagueTrophyHoverTimer);
  leagueTrophyHoverTimer = null;
  leagueTrophyActiveTrigger?.setAttribute("aria-expanded", "false");
  leagueTrophyActiveTrigger = null;
  leagueTrophyPinnedTrigger = null;
  if (!leagueTrophyTooltip) return;
  leagueTrophyTooltip.classList.remove("is-visible");
  leagueTrophyTooltip.setAttribute("aria-hidden", "true");
}

function showLeagueTrophyTooltip(trigger, { pinned = false } = {}) {
  window.clearTimeout(leagueTrophyHoverTimer);
  leagueTrophyHoverTimer = null;
  if (leagueTrophyActiveTrigger && leagueTrophyActiveTrigger !== trigger) {
    leagueTrophyActiveTrigger.setAttribute("aria-expanded", "false");
  }
  leagueTrophyActiveTrigger = trigger;
  if (pinned) leagueTrophyPinnedTrigger = trigger;
  trigger.setAttribute("aria-expanded", "true");
  leagueTrophyTooltip ||= Object.assign(document.createElement("div"), { className: "league-trophy-tooltip" });
  if (!leagueTrophyTooltip.isConnected) {
    leagueTrophyTooltip.setAttribute("role", "tooltip");
    document.body.appendChild(leagueTrophyTooltip);
  }
  leagueTrophyTooltip.innerHTML = `<span>${escapeHTML(trigger.dataset.trophyTier)} ниво</span><strong>${escapeHTML(trigger.dataset.trophyLabel)}</strong><small>${escapeHTML(trigger.dataset.trophyDescription)}</small>`;
  leagueTrophyTooltip.setAttribute("aria-hidden", "false");
  leagueTrophyTooltip.style.left = "0px";
  leagueTrophyTooltip.style.top = "0px";
  leagueTrophyTooltip.classList.add("is-visible");
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = leagueTrophyTooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - tooltipRect.width - 10, Math.max(10, triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2));
  const preferredTop = triggerRect.top - tooltipRect.height - 10;
  const top = preferredTop >= 10 ? preferredTop : triggerRect.bottom + 10;
  leagueTrophyTooltip.style.left = `${left}px`;
  leagueTrophyTooltip.style.top = `${top}px`;
}

function bindLeagueTrophyTooltips(app) {
  app.querySelectorAll("[data-league-trophy]").forEach((trigger) => {
    trigger.addEventListener("mouseenter", () => {
      if (leagueTrophyPinnedTrigger) return;
      window.clearTimeout(leagueTrophyHoverTimer);
      leagueTrophyHoverTimer = window.setTimeout(() => {
        if (trigger.matches(":hover") && !leagueTrophyPinnedTrigger) showLeagueTrophyTooltip(trigger);
      }, leagueTooltipHoverDelay);
    });
    trigger.addEventListener("mouseleave", () => {
      if (!leagueTrophyPinnedTrigger) hideLeagueTrophyTooltip();
    });
    trigger.addEventListener("focus", () => showLeagueTrophyTooltip(trigger));
    trigger.addEventListener("blur", hideLeagueTrophyTooltip);
    trigger.addEventListener("click", () => {
      if (leagueTrophyPinnedTrigger === trigger) {
        hideLeagueTrophyTooltip();
      } else {
        showLeagueTrophyTooltip(trigger, { pinned: true });
      }
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      trigger.click();
    });
  });
  if (!app.dataset.trophyTooltipBound) {
    app.addEventListener("scroll", hideLeagueTrophyTooltip, true);
    app.dataset.trophyTooltipBound = "true";
  }
  if (!leagueTrophyGlobalEventsBound) {
    window.addEventListener("resize", hideLeagueTrophyTooltip);
    document.addEventListener("pointerdown", (event) => {
      if (leagueTrophyPinnedTrigger && !event.target.closest?.("[data-league-trophy]")) hideLeagueTrophyTooltip();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideLeagueTrophyTooltip();
    });
    leagueTrophyGlobalEventsBound = true;
  }
}

function leagueIdentityMarkup() {
  return `
    <article class="league-entry-card">
      <span class="league-live-label"><i></i> Без акаунт и без имейл</span>
      <h3>Избери своя прякор</h3>
      <p>Ще те помним в този браузър и всяка прогноза ще се записва към твоето анонимно участие. Всеки прякор е уникален — главни букви, интервали, тирета и долни черти не създават нов вариант.</p>
      <p class="league-privacy-note">Използваме само необходим анонимен идентификатор. <a href="/privacy">Как работи</a></p>
      <form class="league-inline-form" data-league-register>
        <label><span>Прякор <em>уникален</em></span><input name="nickname" required minlength="3" maxlength="24" autocomplete="nickname" placeholder="Напр. GUNNER_BG" /></label>
        <button class="button primary" type="submit">Създавам общ профил</button>
        <p class="league-form-feedback" data-league-feedback role="status"></p>
      </form>
      <details class="league-recovery-form">
        <summary>Вече участваш? Възстанови с код</summary>
        <form class="league-inline-form" data-league-recover>
          <label><span>Код за възстановяване</span><input name="recoveryCode" required maxlength="16" autocomplete="off" placeholder="DIS-XXXX-XXXX" /></label>
          <button class="button secondary" type="submit">Възстанови</button>
          <p class="league-form-feedback" data-league-feedback role="status"></p>
        </form>
      </details>
    </article>`;
}

function teamMediaLogoUrl(media) {
  const explicitLogo = String(media?.logo || "");
  try {
    const url = new URL(explicitLogo, window.location.origin);
    if (url.protocol === "https:" && ["r2.thesportsdb.com", "www.thesportsdb.com", "media.api-sports.io"].includes(url.hostname)) return url.href;
  } catch {
    // Fall through to the legacy API-Football ID URL.
  }
  const id = Number(media?.id);
  return Number.isInteger(id) && id > 0 ? `https://media.api-sports.io/football/teams/${id}.png` : "";
}

function teamIdentityMarkup(name, media, className = "") {
  const logo = teamMediaLogoUrl(media);
  return `<span class="team-identity ${className}">${logo ? `<img src="${escapeAttribute(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}<span>${escapeHTML(name || "Отбор")}</span></span>`;
}

function leagueProfileMarkup(state) {
  const me = state.me;
  const badges = me.badges?.length
    ? me.badges.map((badge) => leagueBadgeMarkup(badge)).join("")
    : `<span class="league-badge-empty">Първият трофей те чака.</span>`;
  const matchesToNext = Number(me.level?.matchesToNext) || 0;
  return `
    <article class="league-profile-card">
      <div class="league-profile-heading">
        <div><span>Общ D.I.S профил</span><h3 class="${me.isHost ? "is-host" : ""}">${leagueLevelMarkup(me.level)}<span>${escapeHTML(me.nickname)}</span>${me.isHost ? leagueHostBadgeMarkup() : ""}</h3><small>${escapeHTML(state.title)} · ${escapeHTML(state.seasonLabel)}</small></div>
        <strong>${me.totalPoints}<small>точки</small></strong>
      </div>
      <div class="league-badges">${badges}</div>
      <div class="league-profile-stats">
        <div><strong>${leagueRankLabel(me.ranks.week)}</strong><span>тази седмица</span></div>
        <div><strong>${leagueRankLabel(me.ranks.month)}</strong><span>този месец</span></div>
        <div><strong>${leagueRankLabel(me.ranks.season)}</strong><span>D.I.S сезон</span></div>
        <div><strong>${me.currentStreak}</strong><span>текуща серия</span></div>
        <div><strong>${me.exactScores}</strong><span>точни резултати</span></div>
        <div><strong>${me.correctOutcomes}</strong><span>познати мачове</span></div>
      </div>
      <div class="league-level-progress-card">
        <div><span>Ниво ${me.level.value} · ${escapeHTML(me.level.name)}</span><strong>Остават ${matchesToNext} ${matchesToNext === 1 ? "мач" : "мача"} до ниво ${me.level.value + 1}</strong></div>
        <div class="league-level-progress"><span style="width:${me.level.progress}%"></span></div>
        <small>${me.globalCompletedPredictions} общо завършени участия · ${me.completedPredictions} в тази лига</small>
      </div>
      <button class="league-profile-share" type="button" data-league-share-profile><span aria-hidden="true">↗</span> Сподели профила</button>
      <details class="league-profile-settings">
        <summary>Промени прякора</summary>
        <form class="league-inline-form" data-league-profile>
          <label><span>Нов прякор</span><input name="nickname" required minlength="3" maxlength="24" value="${escapeAttribute(me.nickname)}" /></label>
          <button class="button secondary" type="submit">Запази</button>
          <p class="league-form-feedback" data-league-feedback role="status"></p>
        </form>
      </details>
      <details class="league-recovery-reset">
        <summary>Изгуби кода за възстановяване?</summary>
        <div>
          <p>Докато този браузър те разпознава, можеш да създадеш нов код, без да губиш точки или прогнози.</p>
          <strong>Старият код ще спре да работи веднага.</strong>
          <button class="button secondary" type="button" data-league-rotate-recovery>Генерирай нов код</button>
          <p class="league-form-feedback" data-league-feedback role="status"></p>
        </div>
      </details>
    </article>`;
}

function leagueSelectorMarkup(state) {
  const leagues = Array.isArray(state.leagues) ? state.leagues : [];
  if (!leagues.length) return "";
  return `
    <section class="league-selector" aria-label="Избери лига">
      <div class="league-selector-heading">
        <div><span>Избери първенство</span><h3>${escapeHTML(state.title || "Лига на прогнозите")}</h3></div>
        <small>${leagues.length} ${leagues.length === 1 ? "активна лига" : "активни лиги"}</small>
      </div>
      <div class="league-selector-list" role="tablist" aria-label="Лиги на прогнозите">
        ${leagues.map((league) => `
          <button class="league-selector-card ${league.id === state.selectedLeagueId ? "is-active" : ""}" type="button" data-league-select="${escapeAttribute(league.id)}" role="tab" aria-selected="${league.id === state.selectedLeagueId}">
            <span>${league.participating ? "Моя лига" : league.openMatchCount === 1 ? "1 отворен мач" : league.openMatchCount > 1 ? `${league.openMatchCount} отворени мача` : "Очаква мачове"}</span>
            <strong>${escapeHTML(league.title)}</strong>
            <small>${escapeHTML(league.seasonLabel)} · ${league.matchCount} ${league.matchCount === 1 ? "мач" : "мача"}</small>
          </button>`).join("")}
      </div>
    </section>`;
}

function leagueRecoveryModalMarkup(code) {
  return `
    <div class="league-recovery-modal" data-league-recovery-modal role="dialog" aria-modal="true" aria-labelledby="league-recovery-title" aria-describedby="league-recovery-warning">
      <span class="league-recovery-modal-backdrop" data-close-recovery-backdrop aria-hidden="true"></span>
      <section class="league-recovery-dialog">
        <button class="league-recovery-dismiss" type="button" data-close-recovery disabled aria-label="Затварянето ще се отключи след ${leagueRecoveryCloseDelay} секунди">
          <span aria-hidden="true">×</span><small data-recovery-dismiss-count>${leagueRecoveryCloseDelay}</small>
        </button>
        <span class="league-recovery-dialog-kicker"><i></i> Показва се само веднъж</span>
        <span class="league-recovery-dialog-icon" aria-hidden="true">🔐</span>
        <h3 id="league-recovery-title">Запази кода си сега</h3>
        <p>Това е единственият начин да възстановиш прякора, точките и трофеите си на друг телефон или браузър.</p>
        <button class="league-recovery-code" type="button" data-copy-recovery aria-label="Копирай кода за възстановяване">
          <small>Твоят код за възстановяване</small>
          <strong>${escapeHTML(code)}</strong>
          <span data-recovery-copy-label>Натисни, за да копираш</span>
        </button>
        <div class="league-recovery-warning" id="league-recovery-warning">
          <strong>Важно: след затваряне няма да можеш да видиш този код отново.</strong>
          <span>Копирай го, направи screenshot или го запиши на сигурно място.</span>
        </div>
        <button class="button secondary league-recovery-close" type="button" data-close-recovery disabled>
          <span data-recovery-countdown>Можеш да затвориш след ${leagueRecoveryCloseDelay} сек.</span>
        </button>
      </section>
    </div>`;
}

function closeLeagueLevelUp() {
  const celebration = document.querySelector("[data-league-level-up]");
  if (!celebration) return;
  celebration.classList.add("is-leaving");
  window.setTimeout(() => celebration.remove(), 260);
}

async function shareLeagueLevelUp(state, button) {
  const originalLabel = button?.innerHTML;
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Създавам картинката…";
    }
    const result = await shareLeagueLevelUpImage(state);
    if (button && result === "shared") button.textContent = "Споделено ✓";
    if (button && result === "downloaded") button.textContent = "Картинката е свалена ✓";
  } catch (error) {
    if (button) button.textContent = "Опитай отново";
  }
  if (button) window.setTimeout(() => {
    button.innerHTML = originalLabel;
    button.disabled = false;
  }, 1800);
}

function showLeagueLevelUp(state) {
  const me = state.me;
  closeLeagueLevelUp();
  const confetti = Array.from({ length: 22 }, (_, index) =>
    `<i style="--confetti-index:${index};--confetti-x:${(index * 47) % 101}%;--confetti-drift:${(index - 11) * 7}px;--confetti-delay:${(index % 7) * 42}ms" aria-hidden="true"></i>`
  ).join("");
  const celebration = document.createElement("div");
  celebration.className = "league-level-up";
  celebration.dataset.leagueLevelUp = "";
  celebration.setAttribute("role", "status");
  celebration.setAttribute("aria-live", "polite");
  celebration.innerHTML = `
    <div class="league-level-up-confetti">${confetti}</div>
    <div class="league-level-up-card">
      <button type="button" data-close-level-up aria-label="Затвори">×</button>
      <span>Ново футболно ниво</span>
      ${leagueLevelMarkup(me.level)}
      <strong>Ниво ${me.level.value}</strong>
      <h3>${escapeHTML(me.level.name)}</h3>
      <small>${me.level.matchesToNext} ${me.level.matchesToNext === 1 ? "мач" : "мача"} до следващото ниво</small>
      <button class="league-level-up-share" type="button" data-share-level-up><span aria-hidden="true">↗</span> Сподели нивото</button>
    </div>`;
  document.body.appendChild(celebration);
  celebration.querySelector("[data-close-level-up]")?.addEventListener("click", closeLeagueLevelUp);
  const shareButton = celebration.querySelector("[data-share-level-up]");
  shareButton?.addEventListener("click", () => shareLeagueLevelUp(state, shareButton));
  requestAnimationFrame(() => celebration.classList.add("is-visible"));
}

function detectLeagueLevelUp(state) {
  const me = state?.me;
  if (!me?.level?.value) return;
  const storageKey = "dis-league-level-seen";
  const current = { nickname: me.nickname, level: Number(me.level.value) };
  let previous = null;
  try {
    previous = JSON.parse(localStorage.getItem(storageKey) || "null");
    localStorage.setItem(storageKey, JSON.stringify(current));
  } catch {
    return;
  }
  if (previous?.nickname === current.nickname && Number(previous.level) < current.level) {
    showLeagueLevelUp(state);
  }
}

function leagueLeaderboardMarkup(state) {
  const period = predictionLeaguePeriod;
  const rows = state.leaderboards?.[period] || [];
  const labels = { week: "Тази седмица", month: "Този месец", season: "D.I.S сезон" };
  const periodLabel = period === "season" ? state.seasonLabel : state.periods?.[period] || "";
  const myRank = state.me?.ranks?.[period] || null;
  return `
    <article class="league-table-card">
      <div class="league-table-heading"><div><span>Класация</span><h3>${labels[period]}</h3></div><small>${escapeHTML(periodLabel)}</small></div>
      <div class="league-table-tabs" role="tablist" aria-label="Период на класацията">
        ${Object.entries(labels).map(([key, label]) => `<button class="${period === key ? "is-active" : ""}" type="button" data-league-period="${key}" role="tab" aria-selected="${period === key}">${label}</button>`).join("")}
      </div>
      <div class="league-table">
        ${rows.length ? rows.slice(0, 50).map((row) => {
          const trophy = leaguePrimaryBadge(row.badges || []);
          return `
          <div class="league-table-row ${state.me?.nickname === row.nickname ? "is-me" : ""}">
            <strong>${row.rank}</strong>
            <span>
              <span class="league-player-summary" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false"
                data-league-player
                data-nickname="${escapeAttribute(row.nickname)}"
                data-is-host="${row.isHost === true}"
                data-level="${row.level.value}"
                data-level-name="${escapeAttribute(row.level.name)}"
                data-level-tier="${escapeAttribute(row.level.tier)}"
                data-level-tier-label="${escapeAttribute(row.level.tierLabel)}"
                data-level-progress="${row.level.progress}"
                data-matches-to-next="${row.level.matchesToNext}"
                data-rank-week="${row.ranks.week || ""}"
                data-rank-month="${row.ranks.month || ""}"
                data-rank-season="${row.ranks.season || ""}"
                data-current-streak="${row.currentStreak}"
                data-exact-scores="${row.totalExactScores}"
                data-correct-outcomes="${row.totalCorrectOutcomes}"
                data-global-matches="${row.globalCompletedPredictions}"
                data-league-matches="${row.leagueCompletedPredictions}"
                data-trophy-label="${escapeAttribute(trophy?.label || "")}"
                data-trophy-description="${escapeAttribute(trophy?.description || "")}"
                data-trophy-tier="${escapeAttribute(trophy?.tier || "")}"
                aria-label="${escapeAttribute(`${row.nickname}, ниво ${row.level.value}. Покажи статистика.`)}">
                ${leagueLevelMarkup(row.level, true)}<b class="${row.isHost ? "is-host" : ""}">${escapeHTML(row.nickname)}</b>${row.isHost ? leagueHostBadgeMarkup(true) : ""}
              </span>
            </span>
            <em>${row.points} т.</em>
          </div>`;
        }).join("") : `<div class="league-table-empty">Класацията чака първите прогнози.</div>`}
      </div>
      ${state.me ? `<button class="button secondary league-leaderboard-share" type="button" data-league-share-achievement ${myRank ? "" : "disabled"}>${myRank ? "Сподели позицията и точките" : "Позиция след първия резултат"}</button>` : ""}
    </article>`;
}

function leagueMatchMarkup(match, state) {
  const me = state.me;
  const prediction = match.myPrediction;
  const statusLabel = match.status === "settled"
    ? "Приключил"
    : match.status === "cancelled"
      ? "Отменен"
      : match.status === "postponed"
        ? "Отложен"
        : match.status === "locked"
          ? "Заключен"
          : "Приема прогнози";
  const kickoff = match.kickoffAt ? formatLocalDate(match.kickoffAt) : "Началният час предстои";
  const result = match.result ? `${match.result.homeScore}:${match.result.awayScore}` : "";
  const scoring = prediction?.scoring;
  const predictionCopy = prediction ? `${prediction.homeScore}:${prediction.awayScore}` : "—";
  const justSaved = predictionLeagueFlashMatchId === match.id;
  let action = "";
  if (match.status === "open") {
    action = me ? `
      <form class="league-prediction-form" data-league-prediction="${escapeAttribute(match.id)}">
        <div class="league-score-inputs">
          <label>${teamIdentityMarkup(match.homeTeam, match.homeTeamMedia)}<input name="homeScore" type="number" min="0" max="30" inputmode="numeric" required value="${prediction?.homeScore ?? ""}" aria-label="Голове за ${escapeAttribute(match.homeTeam)}" /></label>
          <b>:</b>
          <label>${teamIdentityMarkup(match.awayTeam, match.awayTeamMedia)}<input name="awayScore" type="number" min="0" max="30" inputmode="numeric" required value="${prediction?.awayScore ?? ""}" aria-label="Голове за ${escapeAttribute(match.awayTeam)}" /></label>
        </div>
        <button class="button ${prediction ? "league-update-button" : "primary"} ${justSaved ? "is-confirmed" : ""}" type="submit">${justSaved ? "Прогнозата е записана ✓" : prediction ? "Промени прогнозата" : "Запиши прогнозата"}</button>
        <p class="league-form-feedback" data-league-feedback role="status">${prediction ? `Записана прогноза: ${predictionCopy} · Можеш да я промениш до ${kickoff}.` : `Край за прогнози: ${kickoff} — началото на мача.`}</p>
      </form>` : `<div class="league-match-locked-note">Избери прякор, за да запишеш резултат.</div>`;
  } else if (match.status === "cancelled" || match.status === "postponed") {
    action = `<p class="league-match-locked-note">${match.status === "cancelled" ? "Мачът е отменен и за него няма да бъдат раздадени точки." : "Мачът е отложен. Прогнозите ще се отворят отново, когато бъде обявен нов начален час."}</p>`;
  } else {
    action = `
      <div class="league-settled-prediction ${scoring?.correctOutcome ? "is-correct" : ""}">
        <div><span>Твоята прогноза</span><strong>${predictionCopy}</strong></div>
        ${match.status === "settled" ? `<div><span>Краен резултат</span><strong>${result}</strong></div>` : ""}
        ${scoring ? `<div class="league-earned-points"><span>Спечелени точки</span><strong>+${scoring.points}</strong><small>${scoring.exactScore ? "Точен мерник!" : scoring.correctOutcome ? "Позна победителя или равенството" : "Следващият мач е твой"}${scoring.streakBonus ? ` · +${scoring.streakBonus} серия` : ""}</small></div>` : ""}
      </div>
      ${match.status === "settled" && prediction ? `<button class="button secondary league-share-button" type="button" data-league-share="${escapeAttribute(match.id)}">Сподели резултата</button>` : ""}
      ${!prediction ? `<p class="league-match-locked-note">Няма записана прогноза за този мач.</p>` : ""}`;
  }
  return `
    <article class="league-match-card ${match.status === "settled" ? "is-settled" : ""} ${justSaved ? "is-just-saved" : ""}">
      <div class="league-match-top"><span class="league-match-status status-${match.status}"><i></i>${statusLabel}</span><small>${escapeHTML(match.competition)}${match.isDerby ? " · Дерби" : ""}</small></div>
      <time datetime="${escapeAttribute(match.kickoffAt || "")}"><span>Начало на мача и край за прогнози</span>${escapeHTML(kickoff)}</time>
      <div class="league-fixture"><strong>${teamIdentityMarkup(match.homeTeam, match.homeTeamMedia, "is-home")}</strong><span>${result || "VS"}</span><strong>${teamIdentityMarkup(match.awayTeam, match.awayTeamMedia, "is-away")}</strong></div>
      ${action}
    </article>`;
}

function renderPredictionLeagueApp() {
  const section = document.querySelector("#prediction-league");
  const app = document.querySelector("#prediction-league-app");
  const state = predictionLeagueState;
  if (!section || !app || !state?.enabled) {
    if (section) section.hidden = true;
    return;
  }
  section.hidden = false;
  setText("[data-league-title]", state.hubTitle || "D.I.S Лиги на прогнозите");
  setText("[data-league-description]", state.hubDescription || state.description || "");
  hideLeaguePlayerTooltip();
  hideLeagueTrophyTooltip();
  app.innerHTML = `
    ${predictionLeagueNotice ? `<div class="league-notice">${escapeHTML(predictionLeagueNotice)}</div>` : ""}
    ${predictionLeagueRecoveryCode ? leagueRecoveryModalMarkup(predictionLeagueRecoveryCode) : ""}
    ${leagueSelectorMarkup(state)}
    <div class="league-dashboard-grid">
      ${state.me ? leagueProfileMarkup(state) : leagueIdentityMarkup()}
      ${leagueLeaderboardMarkup(state)}
    </div>
    <div class="league-rules-strip">
      <span><b>+${state.points.outcome}</b> победител или равенство</span>
      <span><b>+${state.points.exactScore}</b> допълнително за точен резултат</span>
      <span><b>+${state.points.streakBonus}</b> бонус на всеки ${state.points.streakEvery} поредни</span>
      <span><b>${state.me?.currentStreak || 0}</b> твоята серия</span>
    </div>
    <div class="league-match-list">
      <div class="league-match-list-heading"><div><span>Следващи прогнози</span><h3>Прогнозирай преди началото на мача.</h3></div><small>${state.matches.length} ${state.matches.length === 1 ? "мач" : "мача"}${state.matches.some((match) => match.dataSource === "TheSportsDB") ? " · Данни: TheSportsDB" : ""}</small></div>
      <div class="league-match-grid">${state.matches.length ? state.matches.map((match) => leagueMatchMarkup(match, state)).join("") : `<article class="empty-state">Следващият кръг в Лигата на прогнозите скоро ще бъде добавен.</article>`}</div>
    </div>`;
  bindPredictionLeagueActions();
  bindLeagueRecoveryModal(app);
  bindLeagueTrophyTooltips(app);
  bindLeaguePlayerTooltips(app);
  detectLeagueLevelUp(state);
  const flashedMatchId = predictionLeagueFlashMatchId;
  predictionLeagueFlashMatchId = "";
  if (flashedMatchId) {
    const confirmedForm = [...app.querySelectorAll("[data-league-prediction]")].find((form) => form.dataset.leaguePrediction === flashedMatchId);
    const confirmedButton = confirmedForm?.querySelector("button");
    if (confirmedButton) {
      window.setTimeout(() => {
        confirmedButton.textContent = "Промени прогнозата";
        confirmedButton.classList.remove("is-confirmed");
      }, 1400);
    }
  }
}

function bindLeagueRecoveryModal(app) {
  const modal = app.querySelector("[data-league-recovery-modal]");
  if (!modal) {
    if (predictionLeagueRecoveryTimer) window.clearInterval(predictionLeagueRecoveryTimer);
    predictionLeagueRecoveryTimer = null;
    return;
  }

  const copyButton = modal.querySelector("[data-copy-recovery]");
  const copyLabel = modal.querySelector("[data-recovery-copy-label]");
  const closeButtons = [...modal.querySelectorAll("[data-close-recovery]")];
  const closeButton = modal.querySelector(".league-recovery-close");
  const dismissButton = modal.querySelector(".league-recovery-dismiss");
  const dismissCount = modal.querySelector("[data-recovery-dismiss-count]");
  const backdrop = modal.querySelector("[data-close-recovery-backdrop]");
  const countdown = modal.querySelector("[data-recovery-countdown]");
  let remaining = leagueRecoveryCloseDelay;
  let closeLocked = true;
  if (predictionLeagueRecoveryTimer) window.clearInterval(predictionLeagueRecoveryTimer);

  const closeModal = () => {
    if (closeLocked) return;
    window.clearInterval(predictionLeagueRecoveryTimer);
    predictionLeagueRecoveryTimer = null;
    predictionLeagueRecoveryCode = "";
    modal.remove();
  };

  predictionLeagueRecoveryTimer = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      countdown.textContent = `Можеш да затвориш след ${remaining} сек.`;
      dismissCount.textContent = remaining;
      return;
    }
    window.clearInterval(predictionLeagueRecoveryTimer);
    predictionLeagueRecoveryTimer = null;
    closeLocked = false;
    closeButtons.forEach((button) => { button.disabled = false; });
    dismissCount.hidden = true;
    dismissButton.setAttribute("aria-label", "Затвори popup-а");
    countdown.textContent = "Запазих кода — затвори";
  }, 1000);

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(predictionLeagueRecoveryCode);
      copyButton.classList.add("is-copied");
      copyLabel.textContent = "Кодът е копиран ✓";
    } catch {
      copyLabel.textContent = "Копирането не е разрешено — запиши кода ръчно";
    }
  });
  closeButtons.forEach((button) => button.addEventListener("click", closeModal));
  backdrop.addEventListener("click", closeModal);
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [dismissButton, copyButton, closeButton].filter((element) => !element.disabled);
    if (focusable.length < 2) {
      event.preventDefault();
      copyButton.focus();
      return;
    }
    const currentIndex = focusable.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
      : (currentIndex + 1) % focusable.length;
    event.preventDefault();
    focusable[nextIndex].focus();
  });
  window.requestAnimationFrame(() => copyButton.focus({ preventScroll: true }));
}

function leagueFormError(form, error) {
  const feedback = form.querySelector("[data-league-feedback]");
  if (feedback) {
    feedback.textContent = error.message;
    feedback.classList.add("is-error");
  }
}

function bindPredictionLeagueActions() {
  const app = document.querySelector("#prediction-league-app");
  if (!app) return;
  app.querySelector("[data-league-register]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const payload = await leagueApi(leagueApiUrl("/api/league/register"), { method: "POST", body: JSON.stringify({ nickname: form.nickname.value }) });
      predictionLeagueState = payload.league;
      predictionLeagueRecoveryCode = payload.recoveryCode || "";
      predictionLeagueNotice = "Добре дошъл в D.I.S Лигата на прогнозите!";
      renderPredictionLeagueApp();
    } catch (error) {
      leagueFormError(form, error);
      button.disabled = false;
    }
  });
  app.querySelector("[data-league-recover]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const payload = await leagueApi(leagueApiUrl("/api/league/recover"), { method: "POST", body: JSON.stringify({ recoveryCode: form.recoveryCode.value }) });
      predictionLeagueState = payload.league;
      predictionLeagueRecoveryCode = "";
      predictionLeagueNotice = "Участието и точките ти са възстановени.";
      renderPredictionLeagueApp();
    } catch (error) {
      leagueFormError(form, error);
      button.disabled = false;
    }
  });
  app.querySelector("[data-league-profile]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const payload = await leagueApi(leagueApiUrl("/api/league/profile"), { method: "PATCH", body: JSON.stringify({ nickname: form.nickname.value }) });
      predictionLeagueState = payload.league;
      predictionLeagueNotice = "Прякорът е променен, а историята ти е запазена.";
      renderPredictionLeagueApp();
    } catch (error) {
      leagueFormError(form, error);
    }
  });
  app.querySelector("[data-league-rotate-recovery]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const container = button.closest(".league-recovery-reset");
    button.disabled = true;
    button.textContent = "Генериране…";
    try {
      const payload = await leagueApi(leagueApiUrl("/api/league/recovery-code"), { method: "POST" });
      predictionLeagueState = payload.league;
      predictionLeagueRecoveryCode = payload.recoveryCode || "";
      predictionLeagueNotice = "Новият код за възстановяване е готов. Старият вече не работи.";
      renderPredictionLeagueApp();
    } catch (error) {
      leagueFormError(container, error);
      button.disabled = false;
      button.textContent = "Генерирай нов код";
    }
  });
  app.querySelectorAll("[data-league-prediction]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const payload = await leagueApi(`/api/league/${encodeURIComponent(predictionLeagueState.selectedLeagueId)}/predictions/${encodeURIComponent(form.dataset.leaguePrediction)}`, {
          method: "PUT",
          body: JSON.stringify({ homeScore: form.homeScore.value, awayScore: form.awayScore.value })
        });
        predictionLeagueState = payload.league;
        predictionLeagueNotice = "";
        predictionLeagueFlashMatchId = form.dataset.leaguePrediction;
        renderPredictionLeagueApp();
      } catch (error) {
        leagueFormError(form, error);
        button.disabled = false;
      }
    });
  });
  app.querySelectorAll("[data-league-period]").forEach((button) => {
    button.addEventListener("click", () => {
      predictionLeaguePeriod = button.dataset.leaguePeriod;
      renderPredictionLeagueApp();
    });
  });
  app.querySelectorAll("[data-league-select]").forEach((button) => {
    button.addEventListener("click", async () => {
      const leagueId = button.dataset.leagueSelect;
      if (!leagueId || leagueId === predictionLeagueState.selectedLeagueId) return;
      button.disabled = true;
      try {
        predictionLeagueState = await leagueApi(leagueApiUrl("/api/league", leagueId));
        predictionLeagueSelectedId = predictionLeagueState.selectedLeagueId;
        localStorage.setItem("dis-selected-league", predictionLeagueSelectedId);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("league", predictionLeagueSelectedId);
        history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        predictionLeaguePeriod = "week";
        predictionLeagueNotice = "";
        renderPredictionLeagueApp();
      } catch (error) {
        button.disabled = false;
      }
    });
  });
  app.querySelectorAll("[data-league-share]").forEach((button) => {
    button.addEventListener("click", async () => {
      const match = predictionLeagueState.matches.find((item) => item.id === button.dataset.leagueShare);
      if (!match) return;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "Подготвям…";
      try {
        const outcome = await shareLeagueResult(match, predictionLeagueState, predictionLeaguePeriod);
        button.textContent = outcome === "downloaded" ? "Картата е свалена ✓" : originalLabel;
      } catch (error) {
        button.textContent = error.message?.includes("QR") ? "QR не се зареди — обнови" : "Неуспешно споделяне";
      }
      window.setTimeout(() => { button.textContent = originalLabel; button.disabled = false; }, 1600);
    });
  });
  app.querySelectorAll("[data-league-share-achievement]").forEach((button) => {
    button.addEventListener("click", async () => {
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "Подготвям…";
      try {
        const outcome = await shareLeagueAchievement(predictionLeagueState, predictionLeaguePeriod);
        if (outcome === "downloaded") button.textContent = "Картата е свалена ✓";
        else button.textContent = originalLabel;
      } catch (error) {
        button.textContent = error.message?.includes("QR") ? "QR не се зареди — обнови" : "Неуспешно споделяне";
      }
      window.setTimeout(() => {
        button.textContent = originalLabel;
        button.disabled = false;
      }, 1600);
    });
  });
  app.querySelector("[data-league-share-profile]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Подготвям…";
    try {
      const outcome = await shareLeagueProfile(predictionLeagueState);
      button.textContent = outcome === "downloaded" ? "Профилът е свален ✓" : originalLabel;
    } catch (error) {
      button.textContent = error.message?.includes("QR") ? "QR не се зареди — обнови" : "Неуспешно споделяне";
    }
    window.setTimeout(() => {
      button.textContent = originalLabel;
      button.disabled = false;
    }, 1600);
  });
}

async function renderPredictionLeague() {
  const section = document.querySelector("#prediction-league");
  if (!section) return;
  try {
    predictionLeagueState = await leagueApi(leagueApiUrl("/api/league", predictionLeagueSelectedId));
    predictionLeagueSelectedId = predictionLeagueState.selectedLeagueId || "";
    if (predictionLeagueSelectedId) localStorage.setItem("dis-selected-league", predictionLeagueSelectedId);
    renderPredictionLeagueApp();
  } catch (error) {
    section.hidden = false;
    document.querySelector("#prediction-league-app").innerHTML = `<article class="empty-state">${escapeHTML(error.message)}</article>`;
  }
}

function drawCanvasRoundRect(context, x, y, width, height, radius, fill, stroke = "") {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.lineTo(x + width - corner, y);
  context.quadraticCurveTo(x + width, y, x + width, y + corner);
  context.lineTo(x + width, y + height - corner);
  context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
  context.lineTo(x + corner, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - corner);
  context.lineTo(x, y + corner);
  context.quadraticCurveTo(x, y, x + corner, y);
  context.closePath();
  if (fill) {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke) {
    context.strokeStyle = stroke;
    context.stroke();
  }
}

function fitCanvasText(context, text, maxWidth, { weight = 900, maxSize = 82, minSize = 28 } = {}) {
  const copy = String(text || "");
  let size = maxSize;
  while (size > minSize) {
    context.font = `${weight} ${size}px Inter, Arial, sans-serif`;
    if (context.measureText(copy).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawCanvasFittedText(context, text, x, y, maxWidth, options = {}) {
  const size = fitCanvasText(context, text, maxWidth, options);
  context.font = `${options.weight || 900} ${size}px Inter, Arial, sans-serif`;
  context.fillText(String(text || ""), x, y);
  return size;
}

function wrapCanvasText(context, text, maxWidth, maxLines = 4) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).flatMap((word) => {
    if (context.measureText(word).width <= maxWidth) return [word];
    const chunks = [];
    let chunk = "";
    [...word].forEach((character) => {
      const candidate = `${chunk}${character}`;
      if (chunk && context.measureText(candidate).width > maxWidth) {
        chunks.push(chunk);
        chunk = character;
      } else {
        chunk = candidate;
      }
    });
    if (chunk) chunks.push(chunk);
    return chunks;
  });
  const lines = [];
  let line = "";
  for (let index = 0; index < words.length; index += 1) {
    const candidate = line ? `${line} ${words[index]}` : words[index];
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = words[index];
    if (lines.length === maxLines - 1) {
      const remaining = [line, ...words.slice(index + 1)].join(" ");
      let finalLine = remaining;
      while (finalLine.length > 1 && context.measureText(`${finalLine}…`).width > maxWidth) finalLine = finalLine.slice(0, -1);
      lines.push(`${finalLine.trim()}…`);
      return lines;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function drawCanvasWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const lines = wrapCanvasText(context, text, maxWidth, maxLines);
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + Math.max(0, lines.length - 1) * lineHeight;
}

const officialHomepageUrl = "https://dis-podcast.onrender.com/";
const shareLogoAssetUrl = "/assets/pwa/icon-192.png";
const shareQrCacheLimit = 6;
const shareQrAssets = new Map();
let shareLogoImagePromise = null;

function loadShareLogoImage() {
  if (!shareLogoImagePromise) {
    shareLogoImagePromise = loadCanvasImage(shareLogoAssetUrl).then((image) => {
      if (!image) shareLogoImagePromise = null;
      return image;
    });
  }
  return shareLogoImagePromise;
}

function rememberShareQrAssets(cacheKey, assetsPromise) {
  shareQrAssets.delete(cacheKey);
  shareQrAssets.set(cacheKey, assetsPromise);
  while (shareQrAssets.size > shareQrCacheLimit) {
    shareQrAssets.delete(shareQrAssets.keys().next().value);
  }
  return assetsPromise;
}

function releaseShareAssetCache() {
  shareQrAssets.clear();
  shareLogoImagePromise = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseShareAssetCache();
});
window.addEventListener("pagehide", releaseShareAssetCache);

function loadShareQrAssets(targetPath = "/") {
  const cacheKey = String(targetPath || "/");
  if (shareQrAssets.has(cacheKey)) {
    return rememberShareQrAssets(cacheKey, shareQrAssets.get(cacheKey));
  }
  const qrUrl = `/api/share-qr?path=${encodeURIComponent(cacheKey)}`;
  const assetsPromise = Promise.all([loadCanvasImage(qrUrl), loadShareLogoImage()])
    .then(([qrImage, logoImage]) => {
      if (!qrImage) throw new Error("QR кодът не се зареди. Обнови страницата след рестарт или deploy.");
      return { qrImage, logoImage };
    })
    .catch((error) => {
      if (shareQrAssets.get(cacheKey) === assetsPromise) shareQrAssets.delete(cacheKey);
      throw error;
    });
  return rememberShareQrAssets(cacheKey, assetsPromise);
}

function drawShareQrBadge(context, assets, x, y, width) {
  const qrImage = assets?.qrImage;
  if (!qrImage) return 0;
  const height = width * 1.23;
  const inset = width * 0.065;
  const qrSize = width - inset * 2;
  const green = "#38f27f";
  context.save();
  context.lineWidth = Math.max(4, width * 0.022);
  drawCanvasRoundRect(context, x, y, width, height, width * 0.12, "rgba(2,7,5,0.98)", green);
  drawCanvasRoundRect(context, x + inset, y + inset, qrSize, qrSize, width * 0.055, "#ffffff");
  context.imageSmoothingEnabled = false;
  context.drawImage(qrImage, x + inset, y + inset, qrSize, qrSize);
  context.imageSmoothingEnabled = true;

  const logoTileSize = qrSize * 0.2;
  const logoX = x + width / 2 - logoTileSize / 2;
  const logoY = y + inset + qrSize / 2 - logoTileSize / 2;
  context.lineWidth = Math.max(3, width * 0.016);
  drawCanvasRoundRect(context, logoX - 4, logoY - 4, logoTileSize + 8, logoTileSize + 8, width * 0.035, "#ffffff", green);
  drawCanvasRoundRect(context, logoX, logoY, logoTileSize, logoTileSize, width * 0.025, "#07120d");
  if (assets.logoImage) {
    context.drawImage(assets.logoImage, logoX + 2, logoY + 2, logoTileSize - 4, logoTileSize - 4);
  } else {
    context.fillStyle = "#f7f8fb";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `900 ${Math.round(logoTileSize * 0.37)}px Inter, Arial, sans-serif`;
    context.fillText("D.I.S", x + width / 2, logoY + logoTileSize / 2);
  }

  const labelY = y + height - width * 0.11;
  context.fillStyle = green;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `900 ${Math.round(width * 0.13)}px Inter, Arial, sans-serif`;
  context.fillText("SCAN ME", x + width * 0.43, labelY);

  context.strokeStyle = "#f4d44d";
  context.lineWidth = Math.max(4, width * 0.024);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(x + width * 0.74, labelY + width * 0.015);
  context.bezierCurveTo(
    x + width * 0.86,
    labelY,
    x + width * 0.9,
    y + inset + qrSize + width * 0.045,
    x + width * 0.88,
    y + inset + qrSize - width * 0.015
  );
  context.stroke();
  context.beginPath();
  context.moveTo(x + width * 0.82, y + inset + qrSize + width * 0.025);
  context.lineTo(x + width * 0.88, y + inset + qrSize - width * 0.015);
  context.lineTo(x + width * 0.92, y + inset + qrSize + width * 0.05);
  context.stroke();
  context.restore();
  return height;
}

function drawCanvasTeamLogo(context, image, x, y, size) {
  if (!image) return;
  context.save();
  context.lineWidth = Math.max(3, size * 0.055);
  drawCanvasRoundRect(context, x, y, size, size, size * 0.24, "#f7f8fb", "rgba(56,242,127,0.72)");
  context.drawImage(image, x + size * 0.12, y + size * 0.12, size * 0.76, size * 0.76);
  context.restore();
}

function drawCanvasLevelBadge(context, level = {}, x, y, size) {
  const colors = {
    starter: "#6fcf8b",
    bronze: "#df9a62",
    silver: "#dce8f5",
    gold: "#f4d44d",
    platinum: "#64dcff",
    diamond: "#9b8cff",
    legendary: "#df9cff"
  };
  const visual = leagueLevelVisual(level);
  const color = colors[visual.tier] || colors.starter;
  const frame = new Path2D(visual.framePath);
  const bandPaths = [];
  if (visual.ornamentBand >= 1) {
    bandPaths.push(new Path2D("M20 29 Q4 20 -7 34 L5 47 L-9 56 Q4 71 24 67 L31 47 Z"), new Path2D("M80 29 Q96 20 107 34 L95 47 L109 56 Q96 71 76 67 L69 47 Z"));
  }
  if (visual.ornamentBand >= 2) {
    bandPaths.push(new Path2D("M15 28 Q0 28 -5 44 Q8 42 18 49"), new Path2D("M85 28 Q100 28 105 44 Q92 42 82 49"));
  }
  if (visual.ornamentBand >= 3) bandPaths.push(new Path2D("M36 9 L42 -2 L50 7 L58 -2 L64 9"));
  if (visual.ornamentCount >= 2) bandPaths.push(new Path2D("M27 93 L73 93 L66 107 L34 107 Z"));
  if (visual.ornamentCount >= 3) bandPaths.push(new Path2D("M13 31 L-8 45 L4 63 L21 51 Z"), new Path2D("M87 31 L108 45 L96 63 L79 51 Z"));
  if (visual.ornamentCount >= 4) bandPaths.push(new Path2D("M34 10 L50 -9 L66 10 L58 20 L42 20 Z"));
  context.save();
  context.translate(x, y);
  context.scale(size / 100, size / 100);
  context.shadowColor = color;
  context.shadowBlur = 9;
  const frameGradient = context.createLinearGradient(8, 5, 92, 96);
  frameGradient.addColorStop(0, "rgba(255,255,255,0.42)");
  frameGradient.addColorStop(0.22, color);
  frameGradient.addColorStop(0.58, "#05090d");
  frameGradient.addColorStop(1, color);
  context.fillStyle = "#071016";
  context.strokeStyle = color;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.lineWidth = visual.tier === "legendary" ? 5 : visual.tier === "diamond" ? 4.8 : visual.tier === "platinum" ? 4.6 : visual.tier === "gold" ? 4.4 : 3.8;
  bandPaths.forEach((path) => {
    context.fill(path);
    context.stroke(path);
  });
  if (visual.ornamentCount >= 5) {
    context.save();
    context.translate(50, 50);
    context.scale(1.13, 1.13);
    context.translate(-50, -50);
    context.globalAlpha = 0.82;
    context.lineWidth = 2;
    context.setLineDash([5, 2]);
    context.stroke(frame);
    context.restore();
    context.setLineDash([]);
    context.globalAlpha = 1;
  }
  context.fillStyle = frameGradient;
  context.fill(frame);
  context.stroke(frame);
  context.shadowBlur = 0;

  context.save();
  context.translate(50, 50);
  context.scale(0.79, 0.79);
  context.translate(-50, -50);
  context.globalAlpha = 0.68;
  context.lineWidth = 1.5;
  context.stroke(frame);
  context.restore();

  context.globalAlpha = 1;
  const coreGradient = context.createRadialGradient(38, 31, 2, 50, 50, 32);
  coreGradient.addColorStop(0, "rgba(255,255,255,0.24)");
  coreGradient.addColorStop(0.34, "#101921");
  coreGradient.addColorStop(1, "#020507");
  context.fillStyle = coreGradient;
  context.lineWidth = 1.6;
  context.beginPath();
  context.arc(50, 50, 29, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  const motifStrokePaths = {
    starter: ["M27 50 Q50 28 73 50 Q50 72 27 50", "M50 27 Q34 50 50 73 Q66 50 50 27"],
    bronze: ["M18 33 L30 21 M16 48 L39 25 M16 64 L27 53 M82 33 L70 21 M84 48 L61 25 M84 64 L73 53"],
    silver: ["M23 70 Q8 50 20 27 M18 61 L9 56 M16 52 L7 46 M18 42 L10 35 M22 33 L17 24", "M77 70 Q92 50 80 27 M82 61 L91 56 M84 52 L93 46 M82 42 L90 35 M78 33 L83 24"],
    gold: ["M31 37 Q17 26 8 34 L26 45 L9 43 Q14 58 31 57", "M69 37 Q83 26 92 34 L74 45 L91 43 Q86 58 69 57"],
    platinum: ["M25 24 L11 11 M75 24 L89 11 M17 50 L1 50 M83 50 L99 50 M29 80 L18 91 M71 80 L82 91"],
    diamond: ["M35 35 L16 20 L5 39 L24 50 L7 58 L27 72 L40 55 Z", "M65 35 L84 20 L95 39 L76 50 L93 58 L73 72 L60 55 Z"],
    legendary: ["M22 76 Q-2 57 15 25 Q13 48 30 43 Q19 59 32 70", "M78 76 Q102 57 85 25 Q87 48 70 43 Q81 59 68 70"]
  };
  context.strokeStyle = color;
  context.globalAlpha = 0.72;
  context.lineWidth = 1.7;
  motifStrokePaths[visual.tier].forEach((path) => context.stroke(new Path2D(path)));

  const motifFillPath = {
    bronze: "M28 78 L72 78 L64 89 L36 89 Z",
    silver: "M41 14 L50 2 L59 14 L50 20 Z",
    gold: "M50 24 L54 34 L65 35 L56 42 L59 53 L50 47 L41 53 L44 42 L35 35 L46 34 Z",
    platinum: "M50 3 L63 17 L56 32 L44 32 L37 17 Z",
    diamond: "M50 1 L64 17 L57 34 L43 34 L36 17 Z",
    legendary: "M25 20 L32 -1 L47 12 L50 -7 L53 12 L68 -1 L75 20 L61 28 L39 28 Z"
  }[visual.tier];
  if (motifFillPath) {
    context.fillStyle = color;
    context.globalAlpha = 0.34;
    context.fill(new Path2D(motifFillPath));
    context.globalAlpha = 0.9;
    context.stroke(new Path2D(motifFillPath));
  }

  context.fillStyle = color;
  const progressX = [32, 41, 50, 59, 68].slice(0, visual.ornamentCount);
  progressX.forEach((progress) => {
    context.save();
    context.translate(progress, 91);
    context.globalAlpha = 1;
    if (visual.tier === "starter") {
      context.lineWidth = 2.2;
      context.beginPath();
      context.arc(0, 1, 3, Math.PI * 1.16, Math.PI * 1.84);
      context.stroke();
    } else if (visual.tier === "bronze") {
      context.rotate(Math.PI / 4);
      context.fillRect(-2.4, -2.4, 4.8, 4.8);
    } else if (visual.tier === "platinum") {
      context.beginPath();
      context.moveTo(0, -5.2);
      context.lineTo(4.6, 0);
      context.lineTo(0, 5.2);
      context.lineTo(-4.6, 0);
      context.closePath();
      context.fill();
    } else if (visual.tier === "diamond") {
      context.beginPath();
      context.moveTo(0, -6);
      context.lineTo(5.2, -2);
      context.lineTo(3.2, 5);
      context.lineTo(-3.2, 5);
      context.lineTo(-5.2, -2);
      context.closePath();
      context.fill();
    } else {
      const points = visual.tier === "gold" ? 5 : visual.tier === "silver" ? 6 : 4;
      const outer = visual.tier === "legendary" ? 5.8 : 4.8;
      const inner = outer * 0.43;
      context.beginPath();
      for (let index = 0; index < points * 2; index += 1) {
        const radius = index % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (index * Math.PI) / points;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
    }
    context.restore();
  });

  context.fillStyle = "rgba(2,5,8,0.96)";
  context.strokeStyle = "rgba(255,255,255,0.24)";
  context.lineWidth = 1.25;
  context.beginPath();
  context.arc(50, 50, 18, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = "#ffffff";
  context.globalAlpha = 1;
  context.font = "900 34px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(visual.value), 50, 51);
  context.restore();
}

function releaseCanvasMemory(canvas) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 1;
  canvas.height = 1;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        releaseCanvasMemory(canvas);
        if (blob) resolve(blob);
        else reject(new Error("PNG картата не може да бъде генерирана."));
      }, "image/png");
    } catch (error) {
      releaseCanvasMemory(canvas);
      reject(error);
    }
  });
}

function downloadShareImage(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function sharePngBlob(blob, { filename, title, text }) {
  if (!blob) throw new Error("Картата не може да бъде генерирана.");
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, text, files: [file] });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  downloadShareImage(blob, filename);
  return "downloaded";
}

async function shareLeagueLevelUpImage(state) {
  const me = state?.me;
  if (!me?.level) throw new Error("Липсва футболно ниво за споделяне.");
  const shareQrAssets = await loadShareQrAssets("/fan-zone");
  const shareUrl = `${officialHomepageUrl.replace(/\/$/, "")}/fan-zone`;
  const tierColor = leagueLevelColors[me.level.tier] || leagueLevelColors.starter;
  const nextMatchWord = Number(me.level.matchesToNext) === 1 ? "МАЧ" : "МАЧА";
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");

  const background = context.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, "#07170f");
  background.addColorStop(0.48, "#071019");
  background.addColorStop(1, "#020405");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1920);

  const glow = context.createRadialGradient(540, 570, 40, 540, 570, 560);
  glow.addColorStop(0, `${tierColor}46`);
  glow.addColorStop(0.5, `${tierColor}16`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 1080, 1200);

  context.save();
  context.globalAlpha = 0.12;
  context.strokeStyle = "#38f27f";
  context.lineWidth = 4;
  context.strokeRect(92, 250, 896, 1420);
  context.beginPath();
  context.arc(540, 760, 255, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(92, 960);
  context.lineTo(988, 960);
  context.stroke();
  context.restore();

  for (let index = 0; index < 34; index += 1) {
    const x = 72 + ((index * 137) % 936);
    const y = 210 + ((index * 211) % 1050);
    const size = 5 + (index % 4) * 3;
    context.save();
    context.translate(x, y);
    context.rotate((index * Math.PI) / 9);
    context.fillStyle = index % 3 === 0 ? "#f4d44d" : index % 3 === 1 ? "#38f27f" : tierColor;
    context.globalAlpha = 0.72;
    context.fillRect(-size, -size / 2, size * 2, size);
    context.restore();
  }

  context.strokeStyle = tierColor;
  context.lineWidth = 8;
  context.strokeRect(38, 38, 1004, 1844);
  context.fillStyle = "#38f27f";
  context.font = "900 38px Inter, Arial, sans-serif";
  context.fillText("D.I.S ЛИГА НА ПРОГНОЗИТЕ", 82, 112);
  context.fillStyle = "#aab2c0";
  drawCanvasFittedText(context, "ОБЩО НИВО ВЪВ ВСИЧКИ D.I.S ЛИГИ", 82, 166, 890, { weight: 800, maxSize: 27, minSize: 20 });

  context.textAlign = "center";
  context.fillStyle = "#38f27f";
  context.font = "900 36px Inter, Arial, sans-serif";
  context.fillText("НОВО ФУТБОЛНО НИВО", 540, 270);
  drawCanvasLevelBadge(context, me.level, 350, 330, 380);

  context.fillStyle = "#f4d44d";
  context.font = "900 42px Inter, Arial, sans-serif";
  context.fillText(`НИВО ${me.level.value}`, 540, 795);
  context.fillStyle = "#ffffff";
  drawCanvasFittedText(context, me.level.name || me.level.tierLabel || "Ново ниво", 540, 915, 880, { weight: 900, maxSize: 104, minSize: 54, align: "center" });
  context.fillStyle = "#c2cad5";
  drawCanvasFittedText(context, me.nickname, 540, 995, 800, { weight: 800, maxSize: 42, minSize: 28, align: "center" });

  drawCanvasRoundRect(context, 105, 1070, 870, 340, 32, "rgba(255,255,255,0.045)", `${tierColor}70`);
  context.fillStyle = "#aab2c0";
  context.font = "800 23px Inter, Arial, sans-serif";
  context.fillText("УЧАСТИЯ", 315, 1145);
  context.fillText("ОСТАВАТ", 765, 1145);
  context.fillStyle = "#ffffff";
  context.font = "900 76px Inter, Arial, sans-serif";
  context.fillText(String(me.globalCompletedPredictions || me.level.completedMatches || 0), 315, 1245);
  context.fillStyle = "#38f27f";
  context.fillText(String(me.level.matchesToNext || 0), 765, 1245);
  context.fillStyle = "#aab2c0";
  context.font = "800 21px Inter, Arial, sans-serif";
  context.fillText("ОБЩО ЗАВЪРШЕНИ", 315, 1292);
  context.fillText(`${nextMatchWord} ДО НИВО ${me.level.value + 1}`, 765, 1292);

  drawCanvasRoundRect(context, 165, 1340, 750, 18, 9, "rgba(255,255,255,0.1)");
  drawCanvasRoundRect(context, 165, 1340, Math.max(18, 750 * (Number(me.level.progress) || 0) / 100), 18, 9, tierColor);

  context.fillStyle = "#ffffff";
  context.font = "900 40px Inter, Arial, sans-serif";
  context.fillText("Прогнозирай. Познай. Изкачи се.", 540, 1515);
  context.textAlign = "left";
  context.fillStyle = "#38f27f";
  drawCanvasFittedText(context, shareUrl.replace(/^https:\/\//, ""), 82, 1770, 630, { weight: 900, maxSize: 28, minSize: 20 });
  drawShareQrBadge(context, shareQrAssets, 770, 1570, 245);

  const blob = await canvasToPngBlob(canvas);
  const safeNickname = String(me.nickname || "player").replace(/[^a-z0-9а-я_-]+/gi, "-");
  return sharePngBlob(blob, {
    filename: `dis-level-${me.level.value}-${safeNickname}.png`,
    title: "Ново D.I.S футболно ниво",
    text: `Качих ниво ${me.level.value} „${me.level.name}“ в D.I.S Лигата на прогнозите! ${shareUrl}`
  });
}

function leagueSharePeriod(state, period) {
  const labels = { week: "ТАЗИ СЕДМИЦА", month: "ТОЗИ МЕСЕЦ", season: "D.I.S СЕЗОН" };
  const rows = state.leaderboards?.[period] || [];
  const row = rows.find((item) => item.nickname === state.me?.nickname);
  const fallbackPoints = period === "week"
    ? state.me?.weeklyPoints
    : period === "month"
      ? state.me?.monthlyPoints
      : state.me?.totalPoints;
  return {
    label: labels[period] || labels.week,
    rank: state.me?.ranks?.[period] || row?.rank || null,
    points: Number(row?.points ?? fallbackPoints) || 0
  };
}

function latestSuccessfulLeagueMatch(state) {
  return [...(state.matches || [])]
    .filter((match) => match.status === "settled" && match.myPrediction?.scoring?.correctOutcome)
    .sort((left, right) => new Date(right.kickoffAt || 0) - new Date(left.kickoffAt || 0))[0] || null;
}

async function shareLeagueAchievement(state, period = "week") {
  if (!state?.me) throw new Error("Липсва профил за споделяне.");
  const standing = leagueSharePeriod(state, period);
  if (!standing.rank) throw new Error("Все още няма позиция за този период.");
  const latestSuccess = latestSuccessfulLeagueMatch(state);
  const [shareQrAssets, latestHomeLogo, latestAwayLogo] = await Promise.all([
    loadShareQrAssets("/fan-zone"),
    loadCanvasImage(teamMediaLogoUrl(latestSuccess?.homeTeamMedia)),
    loadCanvasImage(teamMediaLogoUrl(latestSuccess?.awayTeamMedia))
  ]);
  const shareUrl = `${officialHomepageUrl.replace(/\/$/, "")}/fan-zone`;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  const background = context.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, "#07150e");
  background.addColorStop(0.45, "#09121a");
  background.addColorStop(1, "#030506");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1920);

  context.globalAlpha = 0.16;
  context.strokeStyle = "#38f27f";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(980, 180, 280, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(90, 1660, 360, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
  context.lineWidth = 7;
  context.strokeStyle = "#38f27f";
  context.strokeRect(38, 38, 1004, 1844);

  context.fillStyle = "#38f27f";
  context.font = "900 42px Inter, Arial, sans-serif";
  context.fillText("D.I.S ЛИГА НА ПРОГНОЗИТЕ", 82, 125);
  context.fillStyle = "#9ba6b5";
  context.font = "700 28px Inter, Arial, sans-serif";
  drawCanvasFittedText(context, `${state.title} · ${state.seasonLabel}`, 82, 182, 870, { weight: 700, maxSize: 30, minSize: 22 });
  drawCanvasLevelBadge(context, state.me.level, 82, 235, 92);
  context.fillStyle = "#aab2c0";
  context.font = "800 22px Inter, Arial, sans-serif";
  context.fillText(`НИВО ${state.me.level.value}`, 196, 242);
  context.fillStyle = "#f7f8fb";
  drawCanvasFittedText(context, state.me.nickname, 196, 324, 802, { weight: 900, maxSize: 94, minSize: 42 });
  if (state.me.isHost) {
    context.fillStyle = "#f4d44d";
    context.font = "900 22px Inter, Arial, sans-serif";
    context.fillText("◆ D.I.S ВОДЕЩ", 196, 360);
  }
  context.fillStyle = "#38f27f";
  context.fillRect(82, state.me.isHost ? 382 : 360, 230, 10);

  context.lineWidth = 2;
  drawCanvasRoundRect(context, 70, 420, 940, 540, 34, "rgba(255,255,255,0.045)", "rgba(56,242,127,0.32)");
  context.fillStyle = "#aab2c0";
  context.font = "800 29px Inter, Arial, sans-serif";
  context.fillText("МОЯТА ПОЗИЦИЯ", 112, 500);
  context.fillStyle = standing.rank === 1 ? "#f4d44d" : "#38f27f";
  drawCanvasFittedText(context, `#${standing.rank}`, 105, 800, 500, { weight: 900, maxSize: 290, minSize: 170 });
  context.fillStyle = "#f7f8fb";
  context.font = "900 34px Inter, Arial, sans-serif";
  context.fillText(standing.label, 115, 895);

  drawCanvasRoundRect(context, 620, 555, 330, 250, 28, "rgba(244,212,77,0.08)", "rgba(244,212,77,0.34)");
  context.fillStyle = "#f4d44d";
  context.textAlign = "center";
  drawCanvasFittedText(context, String(standing.points), 785, 705, 270, { weight: 900, maxSize: 126, minSize: 76 });
  context.fillStyle = "#f7f8fb";
  context.font = "900 31px Inter, Arial, sans-serif";
  context.fillText("ТОЧКИ", 785, 760);
  context.textAlign = "left";

  if (latestSuccess) {
    const prediction = latestSuccess.myPrediction;
    const scoring = prediction.scoring || {};
    drawCanvasRoundRect(context, 70, 1025, 940, 570, 34, "rgba(255,255,255,0.035)", "rgba(244,212,77,0.24)");
    context.fillStyle = "#f4d44d";
    context.font = "900 27px Inter, Arial, sans-serif";
    context.fillText(scoring.exactScore ? "ПОСЛЕДЕН УСПЕХ · ТОЧЕН РЕЗУЛТАТ" : "ПОСЛЕДЕН УСПЕХ · ПОЗНАТ ИЗХОД", 112, 1100);
    context.fillStyle = "#f7f8fb";
    context.textAlign = "center";
    const fixtureNameMaxWidth = latestHomeLogo || latestAwayLogo ? 650 : 830;
    drawCanvasFittedText(context, `${latestSuccess.homeTeam} — ${latestSuccess.awayTeam}`, 540, 1210, fixtureNameMaxWidth, { weight: 800, maxSize: 50, minSize: 28 });
    drawCanvasTeamLogo(context, latestHomeLogo, 112, 1145, 82);
    drawCanvasTeamLogo(context, latestAwayLogo, 886, 1145, 82);
    context.fillStyle = "#38f27f";
    context.font = "900 152px Inter, Arial, sans-serif";
    context.fillText(`${prediction.homeScore}:${prediction.awayScore}`, 390, 1425);
    context.textAlign = "left";
    context.fillStyle = "#aab2c0";
    context.font = "700 26px Inter, Arial, sans-serif";
    context.fillText("МОЯТА ПРОГНОЗА", 180, 1490);
    context.fillText(`КРАЕН: ${latestSuccess.result.homeScore}:${latestSuccess.result.awayScore}`, 510, 1490);
    drawCanvasRoundRect(context, 755, 1300, 190, 145, 24, "rgba(56,242,127,0.1)", "rgba(56,242,127,0.3)");
    context.fillStyle = "#38f27f";
    context.textAlign = "center";
    context.font = "900 70px Inter, Arial, sans-serif";
    context.fillText(`+${scoring.points || 0}`, 850, 1390);
    context.fillStyle = "#f7f8fb";
    context.font = "800 22px Inter, Arial, sans-serif";
    context.fillText("ТОЧКИ", 850, 1425);
    context.textAlign = "left";
  } else {
    drawCanvasRoundRect(context, 70, 1025, 940, 400, 34, "rgba(255,255,255,0.035)", "rgba(56,242,127,0.2)");
    context.fillStyle = "#38f27f";
    context.font = "900 29px Inter, Arial, sans-serif";
    context.fillText("ФОРМАТА Е ВРЕМЕННА. КЛАСАТА Е ПОСТОЯННА.", 112, 1120);
    context.fillStyle = "#f7f8fb";
    context.font = "800 54px Inter, Arial, sans-serif";
    context.fillText("Следващата прогноза", 112, 1240);
    context.fillText("вече те чака.", 112, 1310);
  }

  context.fillStyle = "#f7f8fb";
  context.font = "800 34px Inter, Arial, sans-serif";
  context.fillText("Прогнозирай. Познай. Изкачи се.", 82, 1705);
  context.fillStyle = "#38f27f";
  drawCanvasFittedText(context, shareUrl.replace(/^https:\/\//, ""), 82, 1770, 630, { weight: 900, maxSize: 28, minSize: 20 });
  drawShareQrBadge(context, shareQrAssets, 770, 1570, 245);

  const blob = await canvasToPngBlob(canvas);
  const safeNickname = String(state.me.nickname).replace(/[^a-z0-9а-я_-]+/gi, "-");
  return sharePngBlob(blob, {
    filename: `dis-leaderboard-${safeNickname}.png`,
    title: "D.I.S Лига на прогнозите",
    text: `Аз съм ниво ${state.me.level.value} и #${standing.rank} с ${standing.points} точки в ${state.title}! ${shareUrl}`
  });
}

async function shareLeagueProfile(state) {
  const me = state?.me;
  if (!me) throw new Error("Липсва профил за споделяне.");
  const shareQrAssets = await loadShareQrAssets("/fan-zone");
  const shareUrl = `${officialHomepageUrl.replace(/\/$/, "")}/fan-zone`;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  const background = context.createLinearGradient(0, 0, 1080, 1350);
  background.addColorStop(0, "#07170f");
  background.addColorStop(0.52, "#0a1118");
  background.addColorStop(1, "#030506");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1350);
  context.strokeStyle = me.isHost ? "#f4d44d" : "#38f27f";
  context.lineWidth = 8;
  context.strokeRect(38, 38, 1004, 1274);

  context.fillStyle = "#38f27f";
  context.font = "900 42px Inter, Arial, sans-serif";
  context.fillText("МОЯТ D.I.S ПРОФИЛ", 84, 125);
  context.fillStyle = "#9ba6b5";
  context.font = "700 25px Inter, Arial, sans-serif";
  drawCanvasFittedText(context, `${state.title} · ${state.seasonLabel}`, 84, 170, 880, { weight: 700, maxSize: 27, minSize: 20 });

  drawCanvasLevelBadge(context, me.level, 84, 205, 112);
  context.fillStyle = "#aab2c0";
  context.font = "800 22px Inter, Arial, sans-serif";
  context.fillText(`НИВО ${me.level.value} · ${String(me.level.name || me.level.tierLabel || "").toUpperCase()}`, 220, 235);
  context.fillStyle = "#f7f8fb";
  drawCanvasFittedText(context, me.nickname, 220, 310, 580, { weight: 900, maxSize: 72, minSize: 38 });
  if (me.isHost) {
    context.fillStyle = "#f4d44d";
    context.font = "900 22px Inter, Arial, sans-serif";
    context.fillText("◆ D.I.S ВОДЕЩ", 220, 352);
  }
  context.fillStyle = "#f4d44d";
  context.textAlign = "right";
  context.font = "900 92px Inter, Arial, sans-serif";
  context.fillText(String(me.totalPoints || 0), 980, 285);
  context.fillStyle = "#aab2c0";
  context.font = "900 25px Inter, Arial, sans-serif";
  context.fillText("ТОЧКИ", 980, 330);
  context.textAlign = "left";

  const rankItems = [
    ["СЕДМИЦА", leagueRankLabel(me.ranks.week)],
    ["МЕСЕЦ", leagueRankLabel(me.ranks.month)],
    ["D.I.S СЕЗОН", leagueRankLabel(me.ranks.season)]
  ];
  rankItems.forEach(([label, value], index) => {
    const x = 84 + index * 310;
    drawCanvasRoundRect(context, x, 405, 282, 165, 22, "rgba(255,255,255,0.04)", "rgba(56,242,127,0.25)");
    context.fillStyle = "#38f27f";
    context.textAlign = "center";
    context.font = "900 56px Inter, Arial, sans-serif";
    context.fillText(value, x + 141, 485);
    context.fillStyle = "#aab2c0";
    context.font = "800 20px Inter, Arial, sans-serif";
    context.fillText(label, x + 141, 535);
  });
  context.textAlign = "left";

  const statItems = [
    ["СЕРИЯ", me.currentStreak],
    ["ТОЧНИ", me.exactScores],
    ["ПОЗНАТИ", me.correctOutcomes],
    ["ОБЩО МАЧОВЕ", me.globalCompletedPredictions],
    ["В ЛИГАТА", me.completedPredictions]
  ];
  statItems.forEach(([label, value], index) => {
    const x = 84 + index * 190;
    drawCanvasRoundRect(context, x, 610, 172, 150, 18, "rgba(255,255,255,0.03)", "rgba(255,255,255,0.1)");
    context.fillStyle = "#f7f8fb";
    context.textAlign = "center";
    context.font = "900 43px Inter, Arial, sans-serif";
    context.fillText(String(value || 0), x + 86, 678);
    context.fillStyle = "#aab2c0";
    context.font = "800 16px Inter, Arial, sans-serif";
    context.fillText(label, x + 86, 724);
  });
  context.textAlign = "left";

  context.fillStyle = "#d7dde7";
  context.font = "800 23px Inter, Arial, sans-serif";
  context.fillText(`Остават ${me.level.matchesToNext} ${me.level.matchesToNext === 1 ? "мач" : "мача"} до ниво ${me.level.value + 1}`, 84, 825);
  drawCanvasRoundRect(context, 84, 850, 650, 18, 9, "rgba(255,255,255,0.08)");
  drawCanvasRoundRect(context, 84, 850, Math.max(18, 650 * (Number(me.level.progress) || 0) / 100), 18, 9, "#38f27f");
  context.fillStyle = "#9ba6b5";
  context.font = "700 21px Inter, Arial, sans-serif";
  context.fillText(`${me.globalCompletedPredictions} общо завършени участия`, 84, 910);

  context.fillStyle = "#f7f8fb";
  context.font = "800 30px Inter, Arial, sans-serif";
  context.fillText("Прогнозирай. Познай. Изкачи се.", 84, 1105);
  context.fillStyle = "#38f27f";
  drawCanvasFittedText(context, shareUrl.replace(/^https:\/\//, ""), 84, 1170, 650, { weight: 900, maxSize: 26, minSize: 20 });
  drawShareQrBadge(context, shareQrAssets, 790, 900, 215);

  const blob = await canvasToPngBlob(canvas);
  const safeNickname = String(me.nickname).replace(/[^a-z0-9а-я_-]+/gi, "-");
  return sharePngBlob(blob, {
    filename: `dis-profile-${safeNickname}.png`,
    title: "Моят D.I.S профил",
    text: `Ниво ${me.level.value} „${me.level.name}“, ${me.totalPoints} точки и ${me.globalCompletedPredictions} завършени участия в D.I.S Лигата! ${shareUrl}`
  });
}

async function shareLeagueResult(match, state, period = "week") {
  const me = state.me;
  const standing = leagueSharePeriod(state, period);
  const [shareQrAssets, homeLogo, awayLogo] = await Promise.all([
    loadShareQrAssets("/fan-zone"),
    loadCanvasImage(teamMediaLogoUrl(match.homeTeamMedia)),
    loadCanvasImage(teamMediaLogoUrl(match.awayTeamMedia))
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, "#07120d");
  gradient.addColorStop(0.55, "#0b111a");
  gradient.addColorStop(1, "#030506");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1080, 1350);
  context.strokeStyle = "#38f27f";
  context.lineWidth = 8;
  context.strokeRect(38, 38, 1004, 1274);
  context.fillStyle = "#38f27f";
  context.font = "900 48px Inter, sans-serif";
  context.fillText("D.I.S ЛИГА НА ПРОГНОЗИТЕ", 84, 140);
  drawCanvasLevelBadge(context, me.level, 84, 190, 76);
  context.fillStyle = "#aab2c0";
  context.font = "800 20px Inter, Arial, sans-serif";
  context.fillText(`НИВО ${me.level.value}`, 180, 202);
  context.fillStyle = "#f7f8fb";
  context.font = "900 82px Inter, sans-serif";
  drawCanvasFittedText(context, me.nickname, 180, 270, 800, { weight: 900, maxSize: 82, minSize: 42 });
  if (me.isHost) {
    context.fillStyle = "#f4d44d";
    context.font = "900 21px Inter, Arial, sans-serif";
    context.fillText("◆ D.I.S ВОДЕЩ", 180, 312);
  }
  context.fillStyle = "#aab2c0";
  context.font = "700 38px Inter, sans-serif";
  context.fillText(match.competition, 84, 350);
  context.fillStyle = "#f7f8fb";
  context.font = "800 54px Inter, sans-serif";
  drawCanvasFittedText(context, match.homeTeam, 180, 500, 720, { weight: 800, maxSize: 54, minSize: 34 });
  drawCanvasFittedText(context, match.awayTeam, 180, 720, 720, { weight: 800, maxSize: 54, minSize: 34 });
  drawCanvasTeamLogo(context, homeLogo, 84, 425, 78);
  drawCanvasTeamLogo(context, awayLogo, 84, 645, 78);
  context.fillStyle = "#38f27f";
  context.font = "900 150px Inter, sans-serif";
  context.fillText(`${match.myPrediction.homeScore}:${match.myPrediction.awayScore}`, 84, 640);
  context.fillStyle = "#f4d44d";
  context.font = "900 170px Inter, sans-serif";
  context.fillText(`+${match.myPrediction.scoring?.points || 0}`, 84, 980);
  context.fillStyle = "#f7f8fb";
  context.font = "800 48px Inter, sans-serif";
  context.fillText("ТОЧКИ", 420, 970);
  context.fillStyle = "#aab2c0";
  drawCanvasFittedText(context, `Краен резултат: ${match.result.homeScore}:${match.result.awayScore}`, 84, 1080, 665, { weight: 600, maxSize: 36, minSize: 28 });
  drawCanvasFittedText(context, `Позиция ${standing.label.toLowerCase()}: ${standing.rank ? `#${standing.rank}` : "—"}`, 84, 1140, 665, { weight: 600, maxSize: 36, minSize: 26 });
  context.fillStyle = "#38f27f";
  drawCanvasFittedText(context, "dis-podcast.onrender.com/fan-zone", 84, 1240, 665, { weight: 800, maxSize: 34, minSize: 25 });
  drawShareQrBadge(context, shareQrAssets, 805, 1020, 210);
  const blob = await canvasToPngBlob(canvas);
  const filename = `dis-prediction-${String(me.nickname).replace(/[^a-z0-9а-я_-]+/gi, "-")}.png`;
  return sharePngBlob(blob, {
    filename,
    title: "D.I.S Лига на прогнозите",
    text: `Ниво ${me.level.value}: моята прогноза донесе +${match.myPrediction.scoring?.points || 0} точки! ${officialHomepageUrl.replace(/\/$/, "")}/fan-zone`
  });
}

async function renderFanVoting() {
  const pollGrid = document.querySelector("#poll-grid");
  if (!pollGrid) return;

  let voteStates = [];
  try {
    const response = await fetch("/api/votes", { headers: { Accept: "application/json" } });
    if (response.ok) voteStates = (await response.json()).polls || [];
  } catch {
    voteStates = [];
  }

  const polls = config.polls || [];
  pollGrid.innerHTML = polls.length
    ? polls.map((poll) => renderPollCard(poll, voteStates.find((item) => item.id === poll.id))).join("")
    : `<article class="empty-state">В момента няма активно фенско гласуване.</article>`;

  pollGrid.querySelectorAll("[data-vote-option]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-poll-id]");
      card.classList.add("is-voting");
      card.querySelectorAll("button").forEach((control) => { control.disabled = true; });
      try {
        const response = await fetch(`/api/votes/${encodeURIComponent(card.dataset.pollId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId: button.dataset.voteOption })
        });
        const payload = await response.json();
        const nextState = payload.polls?.find((item) => item.id === card.dataset.pollId);
        if (!response.ok && !nextState) throw new Error(payload.error || "Гласуването не успя.");
        const poll = polls.find((item) => item.id === card.dataset.pollId);
        card.outerHTML = renderPollCard(poll, nextState, true);
        const newCard = pollGrid.querySelector(`[data-poll-id="${cssEscape(card.dataset.pollId)}"]`);
        if (newCard) launchVoteSparks(newCard);
      } catch (error) {
        card.classList.remove("is-voting");
        card.querySelectorAll("button").forEach((control) => { control.disabled = false; });
        const feedback = card.querySelector(".poll-feedback");
        if (feedback) feedback.textContent = error.message;
      }
    });
  });
}

function giveawayIsActive(giveaway = {}) {
  const now = Date.now();
  const startsAt = giveaway.startsAt ? new Date(giveaway.startsAt).getTime() : 0;
  const endsAt = giveaway.endsAt ? new Date(giveaway.endsAt).getTime() : Infinity;
  return Boolean(giveaway.id && giveaway.enabled && startsAt <= now && now < endsAt);
}

function giveawayRequirementHTML(requirement = "") {
  const parts = String(requirement).split("|");
  const possibleUrl = parts.length > 1 ? parts.pop().trim() : "";
  const label = parts.join("|").trim();
  if (/^https?:\/\//i.test(possibleUrl)) {
    return `<a href="${escapeAttribute(possibleUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label || "Отвори условието")}</a>`;
  }
  return escapeHTML(requirement);
}

function giveawayPrizes(giveaway = {}) {
  const prizes = Array.isArray(giveaway.prizes)
    ? giveaway.prizes.filter((prize) => String(prize?.name || "").trim())
    : [];
  if (prizes.length) return prizes;
  return [{
    name: giveaway.prize || "Футболна награда",
    quantity: Math.max(1, Number(giveaway.winnerCount) || 1),
    image: ""
  }];
}

function giveawayPrizeSummary(giveaway = {}) {
  const prizes = giveawayPrizes(giveaway);
  const first = prizes[0];
  const extra = prizes.length > 1 ? ` + още ${prizes.length - 1}` : "";
  return `${Number(first.quantity) > 1 ? `${Number(first.quantity)} x ` : ""}${first.name}${extra}`;
}

async function loadGiveawayPublicStatus(giveaway = {}) {
  try {
    const response = await fetch(`/api/giveaway/status?giveawayId=${encodeURIComponent(giveaway.id)}`, {
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" }
    });
    if (!response.ok) return;
    const payload = await response.json();
    document.querySelectorAll("[data-giveaway-participant-count], [data-featured-giveaway-count]").forEach((element) => {
      element.textContent = new Intl.NumberFormat("bg-BG").format(Number(payload.participantCount) || 0);
    });
  } catch {
    // The giveaway remains usable even if the public counter is temporarily unavailable.
  }
}

function countdownParts(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  };
}

function startGiveawayCountdown(giveaway = {}) {
  window.clearInterval(giveawayCountdownTimer);
  const end = giveaway.endsAt ? new Date(giveaway.endsAt).getTime() : 0;
  const countdown = document.querySelector("[data-giveaway-countdown]");
  const featuredCountdown = document.querySelector("[data-featured-giveaway-countdown]");
  if (!end || !Number.isFinite(end)) {
    if (countdown) countdown.hidden = true;
    if (featuredCountdown) featuredCountdown.hidden = true;
    return;
  }

  const update = () => {
    const remaining = end - Date.now();
    if (remaining <= 0) {
      window.clearInterval(giveawayCountdownTimer);
      document.querySelector("#giveaway")?.setAttribute("hidden", "");
      document.querySelector("[data-featured-giveaway]")?.setAttribute("hidden", "");
      return;
    }
    const parts = countdownParts(remaining);
    if (countdown) {
      countdown.hidden = false;
      const values = countdown.querySelector("[data-giveaway-countdown-values]");
      if (values) values.innerHTML = [
        [parts.days, "дни"], [parts.hours, "часа"], [parts.minutes, "минути"], [parts.seconds, "секунди"]
      ].map(([value, label]) => `<span><b>${String(value).padStart(2, "0")}</b><em>${label}</em></span>`).join("");
    }
    if (featuredCountdown) {
      featuredCountdown.hidden = false;
      featuredCountdown.innerHTML = `
        <small><i></i> Оставащо време</small>
        <strong>
          <span><b>${String(parts.days).padStart(2, "0")}</b><em>дни</em></span>
          <span><b>${String(parts.hours).padStart(2, "0")}</b><em>ч.</em></span>
          <span><b>${String(parts.minutes).padStart(2, "0")}</b><em>мин.</em></span>
          <span><b>${String(parts.seconds).padStart(2, "0")}</b><em>сек.</em></span>
        </strong>`;
    }
  };
  update();
  giveawayCountdownTimer = window.setInterval(update, 1000);
}

function renderFeaturedGiveaway(giveaway = {}) {
  const section = document.querySelector("[data-featured-giveaway]");
  if (!section) return;
  const active = giveawayIsActive(giveaway);
  section.hidden = !active;
  if (!active) return;
  setAttribute("[data-featured-giveaway-image]", "src", giveaway.image || "./assets/giveaway-football.webp");
  setHTML("[data-featured-giveaway-title]", brandText(giveaway.title || "D.I.S Giveaway"));
  setHTML("[data-featured-giveaway-prize]", brandText(giveawayPrizeSummary(giveaway)));
}

function renderHomeLeaguePromo(league = {}) {
  const section = document.querySelector("[data-home-league-promo]");
  if (!section) return;

  const now = Date.now();
  const configuredLeagues = Array.isArray(league.leagues)
    ? league.leagues.filter((item) => item?.enabled !== false)
    : [{ ...league, id: league.id || "general" }];
  const activeLeagues = configuredLeagues.map((item) => {
    const openMatches = (Array.isArray(item.matches) ? item.matches : [])
      .filter((match) => {
        if (match?.enabled === false || match?.result) return false;
        if (!match?.kickoffAt) return true;
        const kickoff = new Date(match.kickoffAt).getTime();
        return !Number.isNaN(kickoff) && kickoff > now;
      })
      .sort((left, right) => {
        if (!left?.kickoffAt) return 1;
        if (!right?.kickoffAt) return -1;
        return new Date(left.kickoffAt) - new Date(right.kickoffAt);
      });
    return { ...item, openMatches };
  }).filter((item) => item.openMatches.length > 0);
  const openMatchCount = activeLeagues.reduce((total, item) => total + item.openMatches.length, 0);
  const active = league.enabled !== false && activeLeagues.length > 0;
  section.hidden = !active;
  if (!active) return;

  const visibleLeagues = activeLeagues.slice(0, 3);
  const singleLeague = activeLeagues.length === 1;
  const cards = section.querySelector("[data-home-league-cards]");

  setHTML("[data-home-league-title]", brandText(league.leagues ? (league.title || "D.I.S Лиги на прогнозите") : (league.title || "D.I.S Лига на прогнозите")));
  setText("[data-home-league-description]", league.description || "Избери първенство, направи прогноза и се изкачи в отделната класация.");
  setText("[data-home-league-count]", activeLeagues.length);
  setText("[data-home-league-count-label]", activeLeagues.length === 1 ? "активна лига" : "активни лиги");
  setText("[data-home-league-match-count]", openMatchCount);
  setText("[data-home-league-match-label]", openMatchCount === 1 ? "отворена прогноза" : "отворени прогнози");
  section.classList.toggle("is-single-league", singleLeague);
  section.classList.toggle("has-two-leagues", activeLeagues.length === 2);

  if (cards) {
    cards.innerHTML = visibleLeagues.map((item) => {
      const match = item.openMatches[0];
      const deadline = match.kickoffAt ? formatLocalDate(match.kickoffAt) : "Началният час предстои";
      const extraMatches = item.openMatches.length - 1;
      return `
        <a class="home-league-card${singleLeague ? " is-featured" : ""}" href="/fan-zone?league=${encodeURIComponent(item.id || "general")}#prediction-league" aria-label="Прогнозирай ${escapeAttribute(match.homeTeam || "Отбор 1")} срещу ${escapeAttribute(match.awayTeam || "Отбор 2")} в ${escapeAttribute(item.title || "лигата")}">
          <span class="home-league-card-glow" aria-hidden="true"></span>
          <span class="home-league-card-trophy" aria-hidden="true">🏆</span>
          <span class="home-league-card-topline"><small><i></i> Приема прогнози</small><em>${escapeHTML(item.seasonLabel || "Текущ сезон")}</em></span>
          <strong class="home-league-card-title">${brandText(item.title || "D.I.S Лига на прогнозите")}</strong>
          ${singleLeague && item.description ? `<p>${brandText(item.description)}</p>` : ""}
          <span class="home-league-card-match">
            <small>Следващ мач${match.competition ? ` · ${escapeHTML(match.competition)}` : ""}</small>
            <b><span>${escapeHTML(match.homeTeam || "Отбор 1")}</span><em>срещу</em><span>${escapeHTML(match.awayTeam || "Отбор 2")}</span></b>
          </span>
          <span class="home-league-card-deadline"><small>Край за прогнози</small><time datetime="${escapeAttribute(match.kickoffAt || "")}">${escapeHTML(deadline)}</time></span>
          <span class="home-league-card-action"><small>${extraMatches > 0 ? `+ още ${extraMatches} ${extraMatches === 1 ? "мач" : "мача"}` : "Направи своя избор"}</small><b>Прогнозирай <i aria-hidden="true">→</i></b></span>
        </a>`;
    }).join("");
  }

  const more = section.querySelector("[data-home-league-more]");
  const hiddenLeagueCount = activeLeagues.length - visibleLeagues.length;
  if (more) {
    more.hidden = hiddenLeagueCount < 1;
    more.textContent = hiddenLeagueCount === 1 ? "+1 друга лига" : `+${hiddenLeagueCount} други лиги`;
  }
}

function renderGiveaway(giveaway = {}) {
  const section = document.querySelector("#giveaway");
  if (!section) return;
  const active = giveawayIsActive(giveaway);
  section.hidden = !active;
  if (!active) return;

  setAttribute("[data-giveaway-image]", "src", giveaway.image || "./assets/giveaway-football.webp");
  setHTML("[data-giveaway-title]", brandText(giveaway.title || "D.I.S Giveaway"));
  setHTML("[data-giveaway-description]", brandText(giveaway.description || ""));
  const prizes = document.querySelector("[data-giveaway-prizes]");
  if (prizes) {
    prizes.innerHTML = giveawayPrizes(giveaway).map((prize) => `
      <article class="giveaway-prize-card ${prize.image ? "has-image" : ""}">
        ${prize.image ? `<img src="${escapeAttribute(prize.image)}" alt="${escapeAttribute(prize.name || "Награда")}" />` : ""}
        <span><small>Награда${Number(prize.quantity) > 1 ? ` · ${Number(prize.quantity)} броя` : ""}</small><strong>${brandText(prize.name || "Футболна награда")}</strong></span>
      </article>`).join("");
  }
  const requirements = document.querySelector("[data-giveaway-requirements]");
  const requirementsHeading = document.querySelector("[data-giveaway-requirements-heading]");
  if (requirements) {
    requirements.innerHTML = (giveaway.requirements || []).map((item) => `<li>${giveawayRequirementHTML(item)}</li>`).join("");
    requirements.hidden = !giveaway.requirements?.length;
  }
  if (requirementsHeading) requirementsHeading.hidden = !giveaway.requirements?.length;
  const deadline = document.querySelector("[data-giveaway-deadline]");
  if (deadline) deadline.textContent = giveaway.endsAt ? `Записване до ${formatLocalDate(giveaway.endsAt)}` : "Записването е активно";
  setHTML("[data-giveaway-rules]", escapeHTML(giveaway.officialRules || "").replaceAll("\n", "<br>"));
  setHTML("[data-giveaway-privacy]", escapeHTML(giveaway.privacyNotice || "").replaceAll("\n", "<br>"));
  setHTML("[data-giveaway-platform-notice]", escapeHTML(giveaway.platformNotice || ""));

  const form = document.querySelector("#giveaway-form");
  form.elements.giveawayId.value = giveaway.id;
  const requirementConfirmation = form.querySelector("[data-requirements-confirm]");
  requirementConfirmation.hidden = !giveaway.requirements?.length;
  requirementConfirmation.querySelector("input").required = Boolean(giveaway.requirements?.length);
  const eligibilityConfirmation = form.querySelector("[data-eligibility-confirm]");
  const ageText = form.querySelector("[data-age-confirmation]");
  const minAge = Number(giveaway.minAge);
  const hasMinAge = giveaway.minAge !== null && giveaway.minAge !== "" && Number.isFinite(minAge) && minAge > 0;
  const region = String(giveaway.region || "").trim();
  const hasRegion = Boolean(region);
  eligibilityConfirmation.hidden = !hasMinAge && !hasRegion;
  eligibilityConfirmation.querySelector("input").required = hasMinAge || hasRegion;
  if (hasMinAge && hasRegion) ageText.textContent = `Потвърждавам, че съм навършил/а ${minAge} години и имам право да участвам от ${region}.`;
  else if (hasMinAge) ageText.textContent = `Потвърждавам, че съм навършил/а ${minAge} години.`;
  else if (hasRegion) ageText.textContent = `Потвърждавам, че имам право да участвам от ${region}.`;
  form.elements.socialHandle.required = Boolean(giveaway.socialHandleRequired);
  const socialFieldNote = form.querySelector("[data-social-field-note]");
  if (socialFieldNote) socialFieldNote.textContent = giveaway.socialHandleRequired ? "(задължително)" : "(по желание)";

  if (window.location.hash === "#giveaway") {
    requestAnimationFrame(() => section.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}

function bindGiveawayForm() {
  const form = document.querySelector("#giveaway-form");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const feedback = form.querySelector(".form-feedback");
    const data = Object.fromEntries(new FormData(form).entries());
    data.requirementsConfirmed = form.elements.requirementsConfirmed.checked;
    data.ageConfirmed = form.elements.ageConfirmed.checked;
    data.rulesAccepted = form.elements.rulesAccepted.checked;
    button.disabled = true;
    feedback.textContent = "Записване...";
    feedback.classList.remove("is-error", "is-success");
    try {
      const response = await fetch("/api/giveaway/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Записването не успя.");
      form.reset();
      feedback.textContent = "Готово! Участието ти е записано успешно.";
      feedback.classList.add("is-success");
      form.classList.add("giveaway-success");
      setTimeout(() => form.classList.remove("giveaway-success"), 1200);
      loadGiveawayPublicStatus(config.giveaway);
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add("is-error");
    } finally {
      button.disabled = false;
    }
  });
}

function renderHostPrediction(item = {}, state = {}) {
  const id = String(item.id || "");
  const agree = Number(state.counts?.agree) || 0;
  const disagree = Number(state.counts?.disagree) || 0;
  const total = agree + disagree;
  const agreePercent = total ? Math.round((agree / total) * 100) : 0;
  const disagreePercent = total ? 100 - agreePercent : 0;
  return `
    <article class="prediction-card tilt-card" data-prediction-id="${escapeAttribute(id)}">
      <div class="prediction-meta">
        <span class="prediction-live"><i></i> Прогноза</span>
        <span class="prediction-host"><b>Водещ</b>${escapeHTML(item.host || "D.I.S Подкаст")}</span>
      </div>
      <h3>${escapeHTML(item.match || "Предстоящ мач")}</h3>
      <strong>${escapeHTML(item.prediction || "")}</strong>
      <p>${brandText(item.analysis || "")}</p>
      ${item.createdAt ? `<time datetime="${escapeAttribute(item.createdAt)}">${formatLocalDate(item.createdAt)}</time>` : ""}
      ${id ? `
        <div class="prediction-vote" aria-label="Оцени прогнозата">
          <div class="prediction-vote-heading"><span>Ти как мислиш?</span><small>${total} ${total === 1 ? "глас" : "гласа"}</small></div>
          <div class="prediction-vote-actions">
            <button type="button" data-prediction-choice="agree" class="prediction-vote-button ${state.selected === "agree" ? "is-selected" : ""}" aria-pressed="${state.selected === "agree"}"><span aria-hidden="true">👍</span><b>Съгласен</b><small>${agreePercent}%</small></button>
            <button type="button" data-prediction-choice="disagree" class="prediction-vote-button ${state.selected === "disagree" ? "is-selected" : ""}" aria-pressed="${state.selected === "disagree"}"><span aria-hidden="true">👎</span><b>Не съм съгласен</b><small>${disagreePercent}%</small></button>
          </div>
          <p class="engagement-feedback" aria-live="polite">${state.selected ? "Гласът ти е записан. Можеш да промениш избора си." : "Избери позиция с едно натискане."}</p>
        </div>` : ""}
    </article>`;
}

function bindPredictionVotes(scope) {
  scope.querySelectorAll("[data-prediction-choice]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-prediction-id]");
      const grid = card?.closest("#prediction-grid");
      const id = card?.dataset.predictionId || "";
      const item = (config.predictions || []).find((prediction) => String(prediction.id || "") === id);
      if (!card || !grid || !item || button.disabled) return;
      card.querySelectorAll("[data-prediction-choice]").forEach((control) => { control.disabled = true; });
      const feedback = card.querySelector(".engagement-feedback");
      if (feedback) feedback.textContent = "Записваме гласа…";
      try {
        const response = await fetch(`/api/engagement/predictions/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ choice: button.dataset.predictionChoice })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Гласът не беше записан.");
        engagementState = payload;
        card.outerHTML = renderHostPrediction(item, engagementState.predictions?.[id]);
        const nextCard = grid.querySelector(`[data-prediction-id="${cssEscape(id)}"]`);
        if (nextCard) bindPredictionVotes(nextCard);
      } catch (error) {
        card.querySelectorAll("[data-prediction-choice]").forEach((control) => { control.disabled = false; });
        if (feedback) feedback.textContent = error.message || "Гласът не беше записан. Опитай отново.";
      }
    });
  });
}

function renderPollCard(poll = {}, state = {}, celebrate = false) {
  const counts = state?.counts || {};
  const total = Number(state?.total) || 0;
  const votedOption = state?.votedOption || "";
  const isClosed = poll.status !== "active" || (poll.closesAt && new Date(poll.closesAt).getTime() < Date.now());
  const showResults = Boolean(poll.resultsVisible || votedOption || isClosed);
  return `
    <article class="poll-card ${votedOption ? "has-voted" : ""} ${celebrate ? "vote-celebrate" : ""}" data-poll-id="${escapeAttribute(poll.id)}">
      <div class="poll-scoreline"><span>${isClosed ? "Приключило" : "Гласуването е активно"}</span><strong>${total} ${total === 1 ? "глас" : "гласа"}</strong></div>
      <small>${escapeHTML(poll.title || "Фенски вот")}</small>
      <h3>${escapeHTML(poll.match || "")}</h3>
      <p>${escapeHTML(poll.question || "Направи своя избор")}</p>
      <div class="poll-options">
        ${(poll.options || []).map((option) => {
          const count = Number(counts[option.id]) || 0;
          const percent = total ? Math.round((count / total) * 100) : 0;
          const selected = votedOption === option.id;
          return `
            <button class="poll-option ${selected ? "is-selected" : ""}" type="button" data-vote-option="${escapeAttribute(option.id)}" ${votedOption || isClosed ? "disabled" : ""}>
              <span class="poll-option-label">${teamIdentityMarkup(option.label, option.media)}</span>
              ${showResults ? `<span class="poll-percent">${percent}%</span><i style="--vote-width:${percent}%"></i>` : `<span class="poll-ball" aria-hidden="true"></span>`}
            </button>`;
        }).join("")}
      </div>
      <p class="poll-feedback">${votedOption ? "Гласът ти е записан. Резултатът вече е на таблото." : isClosed ? "Тази анкета е приключила." : "Един посетител може да гласува веднъж."}</p>
      ${poll.closesAt ? `<time datetime="${escapeAttribute(poll.closesAt)}">Край: ${formatLocalDate(poll.closesAt)}</time>` : ""}
    </article>`;
}

function launchVoteSparks(card) {
  for (let index = 0; index < 12; index += 1) {
    const spark = document.createElement("span");
    spark.className = "vote-spark";
    spark.style.setProperty("--spark-x", `${(index % 2 ? 1 : -1) * (24 + Math.random() * 100)}px`);
    spark.style.setProperty("--spark-y", `${-24 - Math.random() * 100}px`);
    spark.style.setProperty("--spark-delay", `${Math.random() * 120}ms`);
    card.append(spark);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
  }
}

function cssEscape(value = "") {
  return String(value).replaceAll('"', '\\"');
}

function bindMessageForms() {
  const typeSelect = document.querySelector("[data-message-type-select]");
  bindCustomSelects();
  if (typeSelect) {
    const requestedType = new URLSearchParams(window.location.search).get("type");
    if (["general", "idea", "partner"].includes(requestedType)) typeSelect.value = requestedType;
    if (typeSelect.dataset.messageFieldsBound !== "true") {
      typeSelect.dataset.messageFieldsBound = "true";
      const syncPartnerFields = () => {
        document.querySelectorAll(".partner-only").forEach((field) => { field.hidden = typeSelect.value !== "partner"; });
      };
      typeSelect.addEventListener("change", syncPartnerFields);
    }
    typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  document.querySelectorAll("[data-message-form]").forEach((form) => {
    if (form.dataset.bound === "true") return;
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const feedback = form.querySelector(".form-feedback");
      const data = Object.fromEntries(new FormData(form).entries());
      data.type = form.dataset.messageType || data.type || "general";
      button.disabled = true;
      feedback.textContent = "Изпращане...";
      feedback.classList.remove("is-error", "is-success");
      try {
        const response = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Съобщението не беше изпратено.");
        form.reset();
        if (typeSelect) typeSelect.dispatchEvent(new Event("change"));
        feedback.textContent = "Съобщението е изпратено към екипа на D.I.S Подкаст.";
        feedback.classList.add("is-success");
      } catch (error) {
        feedback.textContent = error.message;
        feedback.classList.add("is-error");
      } finally {
        button.disabled = false;
      }
    });
  });
}

function bindCustomSelects() {
  document.querySelectorAll("[data-custom-select]").forEach((select) => {
    if (select.dataset.bound === "true") return;
    select.dataset.bound = "true";
    const input = select.querySelector("[data-message-type-select]");
    const trigger = select.querySelector(".custom-select-trigger");
    const menu = select.querySelector(".custom-select-menu");
    const label = select.querySelector("[data-custom-select-label]");
    const options = [...select.querySelectorAll("[data-select-value]")];

    const close = () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      select.classList.remove("is-open");
    };

    const choose = (option) => {
      input.value = option.dataset.selectValue;
      label.textContent = option.textContent.trim();
      options.forEach((item) => {
        const selected = item === option;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close();
      trigger.focus();
    };

    const syncFromInput = () => {
      const option = options.find((item) => item.dataset.selectValue === input.value) || options[0];
      if (option) {
        label.textContent = option.textContent.trim();
        options.forEach((item) => {
          const selected = item === option;
          item.classList.toggle("is-selected", selected);
          item.setAttribute("aria-selected", String(selected));
        });
      }
    };

    trigger.addEventListener("click", () => {
      const opening = menu.hidden;
      document.querySelectorAll("[data-custom-select].is-open .custom-select-menu").forEach((otherMenu) => { otherMenu.hidden = true; });
      document.querySelectorAll("[data-custom-select].is-open").forEach((other) => {
        other.classList.remove("is-open");
        other.querySelector(".custom-select-trigger")?.setAttribute("aria-expanded", "false");
      });
      menu.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
      select.classList.toggle("is-open", opening);
      if (opening) options.find((item) => item.classList.contains("is-selected"))?.focus();
    });

    options.forEach((option) => option.addEventListener("click", () => choose(option)));
    select.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        close();
        trigger.focus();
      }
      if (!menu.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const currentIndex = options.indexOf(document.activeElement);
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + options.length) % options.length;
        options[nextIndex].focus();
      }
    });
    input.addEventListener("change", syncFromInput);
    document.addEventListener("click", (event) => {
      if (!select.contains(event.target)) close();
    });
    syncFromInput();
  });
}

function renderAdMedia(slot = {}) {
  if (!slot.mediaUrl) return "";
  if (slot.mediaType === "video") {
    return `
      <a class="ad-media" href="${escapeAttribute(slot.url || slot.mediaUrl)}" target="_blank" rel="noreferrer">
        <video src="${escapeAttribute(slot.mediaUrl)}" muted playsinline controls></video>
      </a>
    `;
  }
  return `
    <a class="ad-media" href="${escapeAttribute(slot.url || slot.mediaUrl)}" target="_blank" rel="noreferrer">
      <img src="${escapeAttribute(slot.mediaUrl)}" alt="${escapeAttribute(slot.title || "Рекламна медия")}" />
    </a>
  `;
}

function renderActiveAdMarquee(items = []) {
  const viewport = window.innerWidth || 1440;
  const gap = viewport <= 640 ? 12 : 16;
  const cardWidth = viewport <= 640 ? Math.min(310, viewport - 28) : Math.min(560, viewport - 36);
  const targetWidth = viewport * 2.4;
  const repeatEach = Math.max(2, Math.min(12, Math.ceil(targetWidth / (items.length * (cardWidth + gap)))));
  const visualItems = Array.from({ length: repeatEach }, () => items).flat();
  const cards = visualItems
    .map(
      (ad) => `
        <article class="marquee-ad-card">
          ${renderAdMedia(ad)}
          <div class="marquee-ad-copy">
            <small>${escapeHTML(ad.placement || "Активна кампания")}</small>
            <h3>${brandText(ad.title || "Активна реклама")}</h3>
            <p>${brandText(ad.description || "")}</p>
            ${ad.url ? `<a class="ad-link" href="${escapeAttribute(ad.url)}" target="_blank" rel="noreferrer">Отвори кампанията</a>` : ""}
          </div>
        </article>
      `
    )
    .join("");

  return `<div class="ad-marquee-track">${cards}${cards}</div>`;
}

function newsItemSlug(item = {}, index = 0) {
  const explicit = String(item.slug || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  if (explicit) return explicit;
  const title = String(item.title || "news")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52) || "news";
  const dateSuffix = String(item.createdAt || "").replace(/\D/g, "").slice(0, 12) || index + 1;
  return `${title}-${dateSuffix}`;
}

function newsAnchorId(item = {}, index = 0) {
  return `news-${newsItemSlug(item, index)}`;
}

function newsDetailUrl(item = {}, index = 0) {
  return `/news/${encodeURIComponent(newsItemSlug(item, index))}`;
}

function newsExcerpt(item = {}, maxLength = 220) {
  const clean = plainShareText(item.excerpt || item.body || "");
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trim()}…` : clean;
}

function plainShareText(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function loadCanvasImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (!value) image.src = "";
      resolve(value);
    };
    const timeout = window.setTimeout(() => finish(null), 4000);
    image.crossOrigin = "anonymous";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = url;
  });
}

function drawCanvasCoverImage(context, image, x, y, width, height) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = Math.max(0, (imageWidth - sourceWidth) / 2);
  const sourceY = Math.max(0, (imageHeight - sourceHeight) / 2);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function createNewsStoryCanvas(item, image = null, qrAssets = null) {
  const title = plainShareText(item.title || "Новина от D.I.S Подкаст");
  const summary = newsExcerpt(item, 180);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  const background = context.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, "#0a1811");
  background.addColorStop(0.52, "#091019");
  background.addColorStop(1, "#030506");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1920);

  if (image) {
    drawCanvasCoverImage(context, image, 0, 0, 1080, 880);
    const imageShade = context.createLinearGradient(0, 0, 0, 900);
    imageShade.addColorStop(0, "rgba(3,5,6,0.22)");
    imageShade.addColorStop(0.55, "rgba(3,5,6,0.12)");
    imageShade.addColorStop(1, "#07100f");
    context.fillStyle = imageShade;
    context.fillRect(0, 0, 1080, 910);
  } else {
    context.fillStyle = "rgba(56,242,127,0.055)";
    context.beginPath();
    context.arc(930, 310, 360, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(255,255,255,0.035)";
    context.font = "900 250px Inter, Arial, sans-serif";
    context.fillText("D.I.S", 80, 650);
  }

  context.lineWidth = 7;
  context.strokeStyle = "#38f27f";
  context.strokeRect(38, 38, 1004, 1844);
  drawCanvasRoundRect(context, 74, 72, 310, 66, 33, "rgba(3,5,6,0.82)", "rgba(56,242,127,0.42)");
  context.fillStyle = "#38f27f";
  context.font = "900 28px Inter, Arial, sans-serif";
  context.fillText("D.I.S НОВИНИ", 112, 116);

  const contentTop = image ? 820 : 760;
  drawCanvasRoundRect(context, 62, contentTop, 956, 930, 38, "rgba(4,8,10,0.95)", "rgba(255,255,255,0.1)");
  context.fillStyle = "#f4d44d";
  drawCanvasFittedText(context, formatLocalDate(item.createdAt).toUpperCase(), 112, contentTop + 92, 820, { weight: 900, maxSize: 27, minSize: 20 });
  context.fillStyle = "#f7f8fb";
  const titleSize = title.length > 75 ? 64 : title.length > 42 ? 72 : 82;
  context.font = `900 ${titleSize}px Inter, Arial, sans-serif`;
  const titleBottom = drawCanvasWrappedText(context, title, 112, contentTop + 205, 850, titleSize * 1.08, 4);
  context.fillStyle = "#38f27f";
  context.fillRect(112, titleBottom + 42, 210, 9);
  if (summary) {
    context.fillStyle = "#b3bdca";
    context.font = "600 35px Inter, Arial, sans-serif";
    drawCanvasWrappedText(context, summary, 112, titleBottom + 120, 850, 52, 5);
  }

  context.fillStyle = "#f7f8fb";
  context.font = "900 31px Inter, Arial, sans-serif";
  context.fillText("ЦЯЛАТА НОВИНА Е В D.I.S", 112, 1760);
  context.fillStyle = "#38f27f";
  drawCanvasFittedText(context, "dis-podcast.onrender.com/news", 112, 1820, 620, { weight: 800, maxSize: 28, minSize: 18 });
  drawShareQrBadge(context, qrAssets, 770, 1568, 245);
  return canvas;
}

async function shareNewsItem(item) {
  const title = plainShareText(item.title || "Новина от D.I.S Подкаст");
  const newsUrl = new URL("/news", officialHomepageUrl);
  const [image, qrAssets] = await Promise.all([loadCanvasImage(item.imageUrl), loadShareQrAssets(newsDetailUrl(item))]);
  let canvas = createNewsStoryCanvas(item, image, qrAssets);
  let blob;
  try {
    blob = await canvasToPngBlob(canvas);
  } catch {
    canvas = createNewsStoryCanvas(item, null, qrAssets);
    blob = await canvasToPngBlob(canvas);
  }
  const filenamePart = newsAnchorId(item).replace(/^news-/, "") || "news";
  return sharePngBlob(blob, {
    filename: `dis-news-${filenamePart}.png`,
    title,
    text: `${title} ${newsUrl.href}`
  });
}

function bindNewsShareActions(newsGrid, newsItems) {
  newsGrid.querySelectorAll("[data-news-share]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.newsShare);
      const item = newsItems[index];
      if (!item) return;
      const originalMarkup = button.innerHTML;
      button.disabled = true;
      button.textContent = "Споделяне…";
      try {
        const outcome = await shareNewsItem(item);
        if (outcome === "downloaded") button.textContent = "Story картата е свалена ✓";
        else button.innerHTML = originalMarkup;
      } catch (error) {
        button.textContent = error.message?.includes("QR") ? "QR не се зареди — обнови" : "Неуспешно споделяне";
      }
      window.setTimeout(() => {
        button.innerHTML = originalMarkup;
        button.disabled = false;
      }, 1600);
    });
  });
}

function focusSharedNewsCard(newsGrid) {
  if (!window.location.hash.startsWith("#news-")) return;
  let targetId = "";
  try {
    targetId = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return;
  }
  const target = document.getElementById(targetId);
  if (!target || !newsGrid.contains(target) || target.dataset.sharedTargetHandled) return;
  target.dataset.sharedTargetHandled = "true";
  target.classList.add("is-shared-target");
  window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center" }));
}

function renderNewsCard(item = {}, index = 0) {
  const contentIndex = (config.news || []).indexOf(item);
  const stableIndex = contentIndex >= 0 ? contentIndex : index;
  const newsId = newsItemSlug(item, stableIndex);
  const anchorId = newsAnchorId(item, stableIndex);
  const detailUrl = newsDetailUrl(item, stableIndex);
  return `
    <article class="news-card tilt-card" id="${escapeAttribute(anchorId)}" data-news-card="${escapeAttribute(newsId)}">
      <a class="news-card-media" href="${escapeAttribute(detailUrl)}" aria-label="Прочети ${escapeAttribute(item.title || "Новина")}">${
        item.imageUrl
          ? `<img class="news-image" src="${escapeAttribute(item.imageUrl)}" alt="${escapeAttribute(item.title || "Новина")}" />`
          : `<div class="news-image news-image-placeholder">D.I.S</div>`
      }</a>
      <div class="news-content">
        <time datetime="${escapeAttribute(item.createdAt || "")}">${formatLocalDate(item.createdAt)}</time>
        <h3><a href="${escapeAttribute(detailUrl)}">${brandText(item.title || "Новина")}</a></h3>
        <p>${brandText(newsExcerpt(item))}</p>
        ${renderNewsCardReactions(newsId, engagementState.news?.[newsId])}
        <div class="news-card-actions">
          <a class="button primary news-read-button" href="${escapeAttribute(detailUrl)}">Прочети новината</a>
          <button class="button secondary news-share-button" type="button" data-news-share="${index}" aria-label="Сподели новината ${escapeAttribute(item.title || "")}"><span aria-hidden="true">↗</span> Сподели</button>
        </div>
      </div>
    </article>
  `;
}

function renderNewsCardReactions(newsId, state = {}) {
  const total = newsReactionChoices.reduce((sum, choice) => sum + (Number(state.counts?.[choice.id]) || 0), 0);
  return `
    <div class="news-card-reactions" data-news-card-reactions="${escapeAttribute(newsId)}">
      <div class="news-card-reactions-heading"><span>Реагирай</span><small>${total} ${total === 1 ? "реакция" : "реакции"}</small></div>
      <div class="news-card-reaction-options">
        ${newsReactionChoices.map((choice) => {
          const selected = state.selected === choice.id;
          const count = Number(state.counts?.[choice.id]) || 0;
          return `<button type="button" class="news-card-reaction-button ${selected ? "is-selected" : ""}" data-news-card-reaction="${choice.id}" aria-label="${escapeAttribute(choice.label)}: ${count}" aria-pressed="${selected}" title="${escapeAttribute(choice.label)}"><span aria-hidden="true">${choice.emoji}</span><small>${count}</small></button>`;
        }).join("")}
      </div>
      <p class="news-card-reaction-feedback" aria-live="polite"></p>
    </div>`;
}

function bindNewsCardReactions(newsGrid) {
  if (newsGrid.dataset.reactionsBound === "true") return;
  newsGrid.dataset.reactionsBound = "true";
  newsGrid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-news-card-reaction]");
    if (!button || !newsGrid.contains(button) || button.disabled) return;
    const card = button.closest("[data-news-card]");
    const reactionBar = button.closest("[data-news-card-reactions]");
    const newsId = card?.dataset.newsCard || "";
    if (!card || !reactionBar || !newsId) return;
    reactionBar.querySelectorAll("[data-news-card-reaction]").forEach((control) => { control.disabled = true; });
    const feedback = reactionBar.querySelector(".news-card-reaction-feedback");
    if (feedback) feedback.textContent = "Записваме…";
    try {
      const response = await fetch(`/api/engagement/news/${encodeURIComponent(newsId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ reaction: button.dataset.newsCardReaction })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Реакцията не беше записана.");
      engagementState = payload;
      reactionBar.outerHTML = renderNewsCardReactions(newsId, engagementState.news?.[newsId]);
    } catch (error) {
      reactionBar.querySelectorAll("[data-news-card-reaction]").forEach((control) => { control.disabled = false; });
      if (feedback) feedback.textContent = error.message || "Опитай отново.";
    }
  });
}

function pressNewsCardStyle(item = {}, index = 0) {
  const layout = [
    "feature", "sidebar", "column", "column", "column",
    "wide", "compact", "compact", "compact", "wide",
    "wide", "column", "column", "column", "feature",
    "sidebar", "compact", "compact", "wide", "panorama"
  ][index % 20];
  const seed = String(item.id || item.articleUrl || index);
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const photoStyle = item.imageUrl
    ? ["photo-wide", "photo-short", "photo-inset", "photo-tall"][Math.abs(hash) % 4]
    : "no-photo";
  const copyStyle = ["copy-brief", "copy-standard", "copy-long"][Math.abs(hash >>> 3) % 3];
  return `press-news-card--${layout} press-news-card--${photoStyle} press-news-card--${copyStyle}`;
}

function renderPressNewsCard(item = {}, index = 0) {
  const sourceName = item.sourceName || "Международна медия";
  const sourceInitial = sourceName.trim().charAt(0).toUpperCase() || "Ф";
  const publishedLabel = item.publishedAt ? formatLocalDate(item.publishedAt) : "Актуално";
  const cardStyle = pressNewsCardStyle(item, index);
  return `
    <article class="press-news-card ${cardStyle}">
      ${item.imageUrl ? `<a class="press-news-thumb" href="${escapeAttribute(item.articleUrl || "#")}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><img src="${escapeAttribute(item.imageUrl)}" alt="" loading="lazy" decoding="async" /></a>` : ""}
      <div class="press-news-card-meta">
        <span class="press-news-source-mark" aria-hidden="true">${escapeHTML(sourceInitial)}</span>
        <span><small>Външен източник</small><strong>${escapeHTML(sourceName)}</strong></span>
        ${item.isBulgarianFootball ? `<span class="press-news-bg-badge">БГ футбол</span>` : ""}
      </div>
      <time datetime="${escapeAttribute(item.publishedAt || "")}">${escapeHTML(publishedLabel)}</time>
      <h3><a href="${escapeAttribute(item.articleUrl || "#")}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.title || "Футболна новина")}</a></h3>
      ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ""}
      <a class="press-news-link" href="${escapeAttribute(item.articleUrl || "#")}" target="_blank" rel="noopener noreferrer" aria-label="Прочети в ${escapeAttribute(sourceName)}">Прочети в източника <span aria-hidden="true">↗</span></a>
    </article>`;
}

async function renderPressNews() {
  const grid = document.querySelector("#press-news-grid");
  if (!grid) return;
  grid.setAttribute("aria-busy", "true");
  try {
    const response = await fetch("/api/press-news", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Press news unavailable");
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length) {
      grid.innerHTML = items.map(renderPressNewsCard).join("");
    } else if (payload.configured === false) {
      grid.innerHTML = `<article class="empty-state press-news-empty">Футболният вестник се подготвя. Скоро тук ще се появят подбрани международни заглавия на български.</article>`;
    } else {
      grid.innerHTML = `<article class="empty-state press-news-empty">В момента няма достатъчно актуални заглавия. Провери отново по-късно.</article>`;
    }
  } catch {
    grid.innerHTML = `<article class="empty-state press-news-empty">Външните заглавия временно не са достъпни. Новините от D.I.S остават на разположение по-горе.</article>`;
  } finally {
    grid.setAttribute("aria-busy", "false");
  }
}

function renderNewsDetail(container) {
  let slug = "";
  try {
    slug = decodeURIComponent(window.location.pathname.split("/").filter(Boolean)[1] || "");
  } catch {
    slug = "";
  }
  const newsItems = [...(config.news || [])];
  const index = newsItems.findIndex((item, itemIndex) => newsItemSlug(item, itemIndex) === slug);
  const item = newsItems[index];
  if (!item) {
    container.innerHTML = `<article class="news-detail-not-found"><span>404</span><h1>Тази новина не е намерена.</h1><p>Възможно е адресът да е променен или публикацията да е премахната.</p><a class="button primary" href="/news">Към всички новини</a></article>`;
    document.title = "Новината не е намерена | D.I.S Подкаст";
    return;
  }

  const paragraphs = String(item.body || item.excerpt || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHTML(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
  const detailUrl = new URL(newsDetailUrl(item, index), officialHomepageUrl).href;
  const newsId = newsItemSlug(item, index);
  container.innerHTML = `
    <nav class="news-detail-breadcrumb" aria-label="Навигация към новините"><a href="/news">Новини</a><span aria-hidden="true">/</span><span>${escapeHTML(item.title || "Новина")}</span></nav>
    <article class="news-detail-article">
      <header class="news-detail-header">
        <span class="section-kicker">D.I.S Новини</span>
        <time datetime="${escapeAttribute(item.createdAt || "")}">${formatLocalDate(item.createdAt)}</time>
        <h1>${brandText(item.title || "Новина")}</h1>
        ${item.excerpt ? `<p>${brandText(newsExcerpt(item, 320))}</p>` : ""}
      </header>
      ${item.imageUrl ? `<figure class="news-detail-figure"><img src="${escapeAttribute(item.imageUrl)}" alt="${escapeAttribute(item.title || "Новина")}" />${item.imageCaption ? `<figcaption>${escapeHTML(item.imageCaption)}</figcaption>` : ""}</figure>` : ""}
      <div class="news-detail-body">${paragraphs || `<p>${escapeHTML(newsExcerpt(item, 320))}</p>`}</div>
      ${renderNewsReactions(newsId, engagementState.news?.[newsId])}
      <footer class="news-detail-footer">
        <div><span>Сподели историята</span><strong>D.I.S Story карта с QR към сайта</strong></div>
        <button class="button primary" type="button" data-news-detail-share>Сподели новината</button>
      </footer>
    </article>`;

  bindNewsReactions(container, newsId);

  document.title = `${plainShareText(item.title)} | D.I.S Подкаст`;
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", detailUrl);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", plainShareText(item.title));
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", newsExcerpt(item, 180));
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", detailUrl);
  if (item.imageUrl) document.querySelector('meta[property="og:image"]')?.setAttribute("content", new URL(item.imageUrl, officialHomepageUrl).href);

  container.querySelector("[data-news-detail-share]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Подготвям…";
    try {
      const outcome = await shareNewsItem(item);
      button.textContent = outcome === "downloaded" ? "Story картата е свалена ✓" : originalLabel;
    } catch (error) {
      button.textContent = error.message?.includes("QR") ? "QR не се зареди — обнови" : "Неуспешно споделяне";
    }
    window.setTimeout(() => { button.textContent = originalLabel; button.disabled = false; }, 1600);
  });
}

function renderNewsReactions(newsId, state = {}) {
  const total = newsReactionChoices.reduce((sum, choice) => sum + (Number(state.counts?.[choice.id]) || 0), 0);
  return `
    <section class="news-reactions" data-news-reactions="${escapeAttribute(newsId)}" aria-labelledby="news-reactions-title">
      <div class="news-reactions-heading">
        <div><span class="section-kicker">Твоята реакция</span><h2 id="news-reactions-title">Как ти се стори?</h2></div>
        <strong>${total} ${total === 1 ? "реакция" : "реакции"}</strong>
      </div>
      <div class="news-reaction-options">
        ${newsReactionChoices.map((choice) => {
          const selected = state.selected === choice.id;
          return `<button type="button" class="news-reaction-button ${selected ? "is-selected" : ""}" data-news-reaction="${choice.id}" aria-pressed="${selected}"><span aria-hidden="true">${choice.emoji}</span><b>${choice.label}</b><small>${Number(state.counts?.[choice.id]) || 0}</small></button>`;
        }).join("")}
      </div>
      <p class="engagement-feedback" aria-live="polite">${state.selected ? "Реакцията ти е записана. Можеш да я промениш." : "Избери една реакция — не е нужна регистрация."}</p>
    </section>`;
}

function bindNewsReactions(container, newsId) {
  const section = container.querySelector("[data-news-reactions]");
  if (!section) return;
  section.querySelectorAll("[data-news-reaction]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      section.querySelectorAll("[data-news-reaction]").forEach((control) => { control.disabled = true; });
      const feedback = section.querySelector(".engagement-feedback");
      if (feedback) feedback.textContent = "Записваме реакцията…";
      try {
        const response = await fetch(`/api/engagement/news/${encodeURIComponent(newsId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ reaction: button.dataset.newsReaction })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Реакцията не беше записана.");
        engagementState = payload;
        section.outerHTML = renderNewsReactions(newsId, engagementState.news?.[newsId]);
        bindNewsReactions(container, newsId);
      } catch (error) {
        section.querySelectorAll("[data-news-reaction]").forEach((control) => { control.disabled = false; });
        if (feedback) feedback.textContent = error.message || "Реакцията не беше записана. Опитай отново.";
      }
    });
  });
}

function formatLocalDate(value = "") {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(date);
}

function getChipStyle(index) {
  const positions = [
    "top: 8px; left: 0;",
    "top: 112px; right: 0; color: var(--accent-2); animation-delay: -1.2s;",
    "bottom: 0; left: 52px; color: var(--accent); animation-delay: -2.1s;",
    "top: 198px; right: 38px; color: #f5f8fc; animation-delay: -3s;",
    "top: 58px; right: 74px; color: var(--accent); animation-delay: -1.7s;",
    "bottom: 58px; left: 0; color: var(--accent-2); animation-delay: -2.8s;"
  ];
  return positions[index % positions.length];
}

function setText(selector, value = "") {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setHTML(selector, value = "") {
  const element = document.querySelector(selector);
  if (element) element.innerHTML = value;
}

function setAttribute(selector, name, value = "") {
  const element = document.querySelector(selector);
  if (element) element.setAttribute(name, value);
}

function setButton(selector, label, href) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.textContent = label;
  element.href = href;
}

function setSection(key, section) {
  if (!section) return;
  setOptionalHTML(`#${key}-kicker`, brandText(section.kicker || ""));
  setOptionalHTML(`#${key}-title`, brandText(section.title || ""));
  if (section.description !== undefined) setOptionalHTML(`#${key}-description`, brandText(section.description || ""));
}

function setOptionalHTML(selector, value = "") {
  const element = document.querySelector(selector);
  if (!element) return;
  element.innerHTML = value;
  element.hidden = value.trim() === "";
}

function brandText(value = "") {
  const brandName = config.brand?.name || "D.I.S Подкаст";
  let escaped = escapeHTML(value);
  const names = [...new Set([brandName, "D.I.S Подкаст"].filter(Boolean))];
  names.forEach((name) => {
    const escapedBrand = escapeHTML(name);
    escaped = escaped.replaceAll(escapedBrand, `<span class="brand-name">${escapedBrand}</span>`);
  });
  return escaped;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHTML(value);
}

function getPlatformClass(name = "") {
  return `platform-${name.toLowerCase().replaceAll(" ", "-")}`;
}

function getPlatformIcon(name = "") {
  const key = name.toLowerCase();
  if (key.includes("email") || key.includes("mail")) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5h16v11H4v-11Z"></path>
        <path d="m5 7.5 7 5.2 7-5.2"></path>
      </svg>
    `;
  }
  if (key.includes("instagram")) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="5"></rect>
        <circle cx="12" cy="12" r="3.4"></circle>
        <circle cx="17.2" cy="6.8" r="1.1"></circle>
      </svg>
    `;
  }
  if (key.includes("youtube")) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.2 7.4a3 3 0 0 0-2.1-2.1C17.2 4.8 12 4.8 12 4.8s-5.2 0-7.1.5a3 3 0 0 0-2.1 2.1A31 31 0 0 0 2.3 12a31 31 0 0 0 .5 4.6 3 3 0 0 0 2.1 2.1c1.9.5 7.1.5 7.1.5s5.2 0 7.1-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.6 31 31 0 0 0-.5-4.6Z"></path>
        <path d="m10 15.4 5.2-3.4L10 8.6v6.8Z" class="icon-cut"></path>
      </svg>
    `;
  }
  if (key.includes("tiktok")) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.6 3h3.1c.2 1.2.8 2.2 1.6 3 .8.8 1.8 1.3 3 1.5v3.1a8.7 8.7 0 0 1-4.7-1.4v6.5a5.3 5.3 0 1 1-5.3-5.3c.4 0 .8 0 1.1.1v3.2a2.2 2.2 0 1 0 1.2 2V3Z"></path>
      </svg>
    `;
  }
  if (key.includes("facebook")) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 8.4V6.9c0-.7.5-.9 1-.9h2.1V2.4c-.4-.1-1.8-.2-3.4-.2-3.3 0-5.5 2-5.5 5.7v.5H5v4h3.2V22H12v-9.6h3.2l.5-4H12v-.5c0-1.1.3-1.5 2-1.5Z"></path>
      </svg>
    `;
  }
  return `<span>${name.slice(0, 2).toUpperCase()}</span>`;
}

function renderLegalFooter(brandName) {
  document.querySelectorAll(".site-footer").forEach((footer) => {
    let legal = footer.querySelector(".footer-legal");
    if (!legal) {
      legal = document.createElement("div");
      legal.className = "footer-legal";
      footer.append(legal);
    }
    legal.innerHTML = `
      <span>&copy; ${new Date().getFullYear()} ${escapeHTML(brandName)}. Всички права запазени.</span>
      <nav aria-label="Правна информация">
        <a href="/privacy">Поверителност</a>
        <a href="/cookies">Бисквитки</a>
        <button type="button" data-cookie-settings>Настройки</button>
      </nav>`;
  });
}

function bindGiveawayRulesLinks() {
  const rules = document.querySelector("#giveaway-rules");
  if (!rules) return;
  document.querySelectorAll('a[href="#giveaway-rules"]').forEach((link) => {
    if (link.dataset.bound === "true") return;
    link.dataset.bound = "true";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      rules.open = true;
      history.replaceState(null, "", "#giveaway-rules");
      rules.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function getYouTubeEmbedUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    let id = "";
    if (parsed.hostname.includes("youtu.be")) id = parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (parsed.searchParams.has("v")) id = parsed.searchParams.get("v");
    if (parsed.pathname.includes("/shorts/")) id = parsed.pathname.split("/shorts/")[1]?.split("/")[0] || "";
    if (parsed.pathname.includes("/embed/")) id = parsed.pathname.split("/embed/")[1]?.split("/")[0] || "";
    if (id) return `https://www.youtube.com/embed/${id}`;
    if (parsed.pathname.includes("@dispodcastt")) return "https://www.youtube.com/embed?listType=user_uploads&list=dispodcastt";
  } catch {
    return "";
  }
  return "";
}

function bindPressNewsReveal() {
  const target = document.querySelector(".press-news-section");
  if (!target || target.dataset.revealBound === "true") return;
  target.dataset.revealBound = "true";
  target.classList.add("reveal", "reveal-fast");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0, rootMargin: "0px 0px 180px 0px" }
  );
  observer.observe(target);
}

function bindMotion() {
  const sectionRevealTargets = document.querySelectorAll(".section");
  const sectionRevealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0, rootMargin: "0px 0px 96px 0px" }
  );
  const cardRevealTargets = document.querySelectorAll(
    ".format-card, .social-card, .stat-card, .ad-card, .package-card, .marquee-ad-card, .youtube-player, .discovery-card, .host-card, .prediction-card, .poll-card, .league-entry-card, .league-profile-card, .league-table-card, .league-match-card"
  );
  const cardRevealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0.12 }
  );
  sectionRevealTargets.forEach((target) => {
    if (target.dataset.revealBound === "true") return;
    target.dataset.revealBound = "true";
    target.classList.add("reveal");
    sectionRevealObserver.observe(target);
  });
  cardRevealTargets.forEach((target) => {
    if (target.dataset.revealBound === "true") return;
    target.dataset.revealBound = "true";
    target.classList.add("reveal");
    cardRevealObserver.observe(target);
  });

  const countObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.target.dataset.done) return;
        entry.target.dataset.done = "true";
        const end = Number(entry.target.dataset.count || 0);
        const duration = 1100;
        const startTime = performance.now();

        const tick = (time) => {
          const progress = Math.min((time - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          entry.target.textContent = Math.round(end * eased).toLocaleString("bg-BG");
          if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.45 }
  );

  document.querySelectorAll("[data-count]").forEach((counter) => {
    if (counter.dataset.countBound === "true") return;
    counter.dataset.countBound = "true";
    countObserver.observe(counter);
  });

  document.querySelectorAll(".magnetic").forEach((button) => {
    if (button.dataset.motionBound === "true") return;
    button.dataset.motionBound = "true";
    button.addEventListener("pointermove", (event) => {
      const rect = button.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      button.style.transform = `translate(${x * 0.16}px, ${y * 0.2}px)`;
    });

    button.addEventListener("pointerleave", () => {
      button.style.transform = "";
    });
  });

  document.querySelectorAll(".tilt-card").forEach((card) => {
    if (card.dataset.motionBound === "true") return;
    card.dataset.motionBound = "true";
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${y * -4}deg) rotateY(${x * 5}deg) translateY(-4px)`;
    });

    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  });

  bindFootballCursor();
}

function bindFootballCursor() {
  const canUseCursor =
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!canUseCursor) return;
  if (document.documentElement.dataset.footballCursorBound === "true") return;
  document.documentElement.dataset.footballCursorBound = "true";

  let lastTrail = 0;

  function addTrail(x, y) {
    const mark = document.createElement("span");
    mark.className = "football-cursor-trail";
    mark.style.left = `${x}px`;
    mark.style.top = `${y}px`;
    document.body.append(mark);
    mark.addEventListener("animationend", () => mark.remove(), { once: true });
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      const now = performance.now();
      if (now - lastTrail > 48) {
        addTrail(event.clientX, event.clientY);
        lastTrail = now;
      }
    },
    { passive: true }
  );
}

const heroImage = document.querySelector(".hero-image");
const heroStack = document.querySelector(".hero-stack");
const scrollBall = document.querySelector(".scroll-ball");
let marqueeResizeTimer;

window.addEventListener(
  "scroll",
  () => {
    const y = window.scrollY;
    if (heroImage) {
      const hero = heroImage.closest(".hero");
      const heroHeight = hero?.offsetHeight || window.innerHeight;
      const heroProgress = Math.min(Math.max(y / heroHeight, 0), 1);
      const heroOffset = heroProgress * 48;
      heroImage.style.transform = `scale(1.04) translateY(${heroOffset}px)`;
    }
    if (heroStack) heroStack.style.transform = `translateY(${y * -0.12}px)`;
    if (scrollBall) {
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(Math.max(y / max, 0), 1);
      scrollBall.style.setProperty("--scroll-progress", progress.toFixed(4));
    }
  },
  { passive: true }
);

window.addEventListener(
  "resize",
  () => {
    window.clearTimeout(marqueeResizeTimer);
    marqueeResizeTimer = window.setTimeout(() => {
      const activeAds = config.activeAds || [];
      document.querySelectorAll("[data-active-ad-marquee]").forEach((marquee) => {
        marquee.innerHTML = activeAds.length ? renderActiveAdMarquee(activeAds) : "";
      });
    }, 160);
  },
  { passive: true }
);

if (window.location.hash && !window.location.hash.startsWith("#news-") && performance.getEntriesByType("navigation")[0]?.type === "reload") {
  history.replaceState(null, "", window.location.pathname);
  window.scrollTo(0, 0);
}

window.DIS_PWA_REFRESH = () => loadContent({ allowFallback: false });
loadContent();
