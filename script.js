let config = window.DIS_SITE_CONFIG || {};
let giveawayCountdownTimer = null;

function optimizeStaticAssetUrls(value) {
  if (Array.isArray(value)) return value.map(optimizeStaticAssetUrls);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, optimizeStaticAssetUrls(item)]));
  }
  if (typeof value !== "string" || !value.includes("assets/") || value.endsWith("dis-logo.png")) return value;
  return value.replace(/\.png$/, ".webp");
}

async function loadContent() {
  try {
    const response = await fetch("/api/content", { headers: { Accept: "application/json" } });
    if (response.ok) {
      config = optimizeStaticAssetUrls(await response.json());
    }
  } catch {
    const savedConfig = localStorage.getItem("dis-site-config");
    if (savedConfig) config = optimizeStaticAssetUrls(JSON.parse(savedConfig));
  }

  config = optimizeStaticAssetUrls(config);

  renderPage();
  document.documentElement.classList.add("content-ready");
  await renderFanVoting();
  bindGiveawayForm();
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
  const contactEmail = footer.email || sections.contact?.email || "hello@dispodcast.bg";

  const titleSuffix = {
    "/news": "Новини",
    "/fan-zone": "Фен зона",
    "/hosts": "Водещи",
    "/partners": "Партньорства",
    "/contact": "Контакт"
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
  const footerNav = document.querySelector("[data-footer-nav]");
  const footerSocials = document.querySelector("[data-footer-socials]");
  const footerEmail = document.querySelector("[data-footer-email]");
  const hostsGrid = document.querySelector("#hosts-grid");
  const predictionGrid = document.querySelector("#prediction-grid");
  const discoveryGrid = document.querySelector("#home-discovery-grid");
  const giveawaySection = document.querySelector("#giveaway");
  const featuredGiveaway = document.querySelector("[data-featured-giveaway]");

  if (mainNav) {
    mainNav.innerHTML = (config.nav || [])
      .map((item) => {
        const href = item.href || "#";
        const pageHref = !document.querySelector("#hero") && href.startsWith("#") ? `/${href}` : href;
        const current = pageHref === window.location.pathname || (pageHref === "/" && window.location.pathname === "/");
        return `<a class="${current ? "is-current" : ""}" href="${escapeAttribute(pageHref)}">${escapeHTML(item.label || "")}</a>`;
      })
      .join("");
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
      ? config.predictions.map((item) => `
          <article class="prediction-card tilt-card">
            <div class="prediction-meta">
              <span class="prediction-live"><i></i> Прогноза</span>
              <span class="prediction-host"><b>Водещ</b>${escapeHTML(item.host || "D.I.S Подкаст")}</span>
            </div>
            <h3>${escapeHTML(item.match || "Предстоящ мач")}</h3>
            <strong>${escapeHTML(item.prediction || "")}</strong>
            <p>${brandText(item.analysis || "")}</p>
            ${item.createdAt ? `<time datetime="${escapeAttribute(item.createdAt)}">${formatLocalDate(item.createdAt)}</time>` : ""}
          </article>`).join("")
      : `<article class="empty-state">Очаквай следващите прогнози на водещите.</article>`;
  }

  if (giveawaySection) renderGiveaway(config.giveaway);
  if (featuredGiveaway) renderFeaturedGiveaway(config.giveaway);
  if ((giveawaySection || featuredGiveaway) && giveawayIsActive(config.giveaway)) {
    loadGiveawayPublicStatus(config.giveaway);
    startGiveawayCountdown(config.giveaway);
  }

  if (newsGrid) {
    const newsItems = [...(config.news || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    newsGrid.innerHTML = newsItems.length
      ? newsItems.map(renderNewsCard).join("")
      : `<article class="empty-state">Все още няма добавени новини.</article>`;
  }

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
              <span class="poll-option-label">${escapeHTML(option.label)}</span>
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
    const syncPartnerFields = () => {
      document.querySelectorAll(".partner-only").forEach((field) => { field.hidden = typeSelect.value !== "partner"; });
    };
    typeSelect.addEventListener("change", syncPartnerFields);
    typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  document.querySelectorAll("[data-message-form]").forEach((form) => {
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

function renderNewsCard(item = {}) {
  return `
    <article class="news-card tilt-card">
      ${
        item.imageUrl
          ? `<img class="news-image" src="${escapeAttribute(item.imageUrl)}" alt="${escapeAttribute(item.title || "Новина")}" />`
          : `<div class="news-image news-image-placeholder">D.I.S</div>`
      }
      <div class="news-content">
        <time datetime="${escapeAttribute(item.createdAt || "")}">${formatLocalDate(item.createdAt)}</time>
        <h3>${brandText(item.title || "Новина")}</h3>
        <p>${brandText(item.body || "")}</p>
      </div>
    </article>
  `;
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

function bindMotion() {
  const revealTargets = document.querySelectorAll(
    ".section, .format-card, .social-card, .stat-card, .ad-card, .package-card, .marquee-ad-card, .youtube-player, .discovery-card, .host-card, .prediction-card, .poll-card"
  );
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0.12 }
  );

  revealTargets.forEach((target) => {
    target.classList.add("reveal");
    revealObserver.observe(target);
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

  document.querySelectorAll("[data-count]").forEach((counter) => countObserver.observe(counter));

  document.querySelectorAll(".magnetic").forEach((button) => {
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

if (window.location.hash && performance.getEntriesByType("navigation")[0]?.type === "reload") {
  history.replaceState(null, "", window.location.pathname);
  window.scrollTo(0, 0);
}

loadContent();
