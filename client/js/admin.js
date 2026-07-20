let adminConfig = structuredClone(window.DIS_SITE_CONFIG);
let savedConfig = structuredClone(window.DIS_SITE_CONFIG);

const status = document.querySelector("#admin-status");
const brandEditor = document.querySelector("#brand-editor");
const navEditor = document.querySelector("#nav-editor");
const heroEditor = document.querySelector("#hero-editor");
const sectionEditors = [...document.querySelectorAll("[data-section-keys]")];
const tickerInput = document.querySelector("#ticker-input");
const socialsEditor = document.querySelector("#socials-editor");
const youtubeEditor = document.querySelector("#youtube-editor");
const newsEditor = document.querySelector("#news-editor");
const formatsEditor = document.querySelector("#formats-editor");
const sponsorPanelEditor = document.querySelector("#sponsor-panel-editor");
const adsEditor = document.querySelector("#ads-editor");
const activeAdsEditor = document.querySelector("#active-ads-editor");
const statsEditor = document.querySelector("#stats-editor");
const packagesEditor = document.querySelector("#packages-editor");
const fanPageEditor = document.querySelector("#fan-page-editor");
const hostsPageEditor = document.querySelector("#hosts-page-editor");
const partnersPageEditor = document.querySelector("#partners-page-editor");
const contactPageEditor = document.querySelector("#contact-page-editor");
const predictionsEditor = document.querySelector("#predictions-editor");
const pollsEditor = document.querySelector("#polls-editor");
const leagueListEditor = document.querySelector("#league-list-editor");
const leagueSettingsEditor = document.querySelector("#league-settings-editor");
const leagueMatchesEditor = document.querySelector("#league-matches-editor");
const leagueTrophiesEditor = document.querySelector("#league-trophies-editor");
const giveawayEditor = document.querySelector("#giveaway-editor");
const giveawayEntriesEditor = document.querySelector("#giveaway-entries-editor");
const giveawayAdminToolbar = document.querySelector("#giveaway-admin-toolbar");
const hostsEditor = document.querySelector("#hosts-editor");
const messagesEditor = document.querySelector("#messages-editor");
const inboxCount = document.querySelector("#inbox-count");
const footerEditor = document.querySelector("#footer-editor");
const footerLinksEditor = document.querySelector("#footer-links-editor");
const footerSocialsEditor = document.querySelector("#footer-socials-editor");
const confirmModal = document.querySelector("#confirm-modal");
const confirmTitle = document.querySelector("#confirm-title");
const confirmMessage = document.querySelector("#confirm-message");
const confirmOk = document.querySelector("[data-confirm-ok]");
const confirmAlt = document.querySelector("[data-confirm-alt]");
const confirmCancelControls = document.querySelectorAll("[data-confirm-cancel]");
const winnerModal = document.querySelector("#winner-modal");
const winnerModalNames = document.querySelector("#winner-modal-names");
const winnerModalCopy = document.querySelector("#winner-modal-copy");
const winnerConfetti = document.querySelector("#winner-confetti");
const winnerModalCloseControls = document.querySelectorAll("[data-winner-modal-close]");
let pendingConfirmation = null;
let giveawayEntriesCache = [];
let giveawayEntrySearchTerm = "";
let giveawayEntryFilters = { winnersOnly: false, ineligibleOnly: false };
let winnerAnimationTimer = null;
let adminSelectedLeagueId = "";
const teamMediaSearchResults = new WeakMap();
const leagueTrophyConditions = Object.freeze([
  ["exact", "Поне 1 точен резултат", "Познал си точния резултат в поне един мач."],
  ["voice", "Участие в поне 10 мача", "Участвал си с прогноза в поне 10 мача."],
  ["derby", "3 правилни дерби прогнози", "Познал си победителя или равенството в 3 дербита."],
  ["streak", "5 правилни прогнози поред", "Направил си 5 правилни прогнози поред."],
  ["monthlyChampion", "№1 за месеца", "Завършил си на първо място в месечната класация."]
]);
const leagueTrophyTiers = Object.freeze([
  ["bronze", "Бронзово · кафяво-оранжево"],
  ["silver", "Сребърно · светлосиво"],
  ["gold", "Златно · жълто"],
  ["platinum", "Платинено · светлосиньо"],
  ["legendary", "Легендарно · лилаво"]
]);
const imageUploadProfiles = {
  hero: { maxDimension: 1920, targetBytes: 1_200_000, label: "1920 px и 1.2 MB" },
  content: { maxDimension: 1600, targetBytes: 800_000, label: "1600 px и 800 KB" }
};
const maxUploadImageBytes = 1_200_000;

function createGiveawayDraft() {
  return {
    id: `giveaway-${Date.now()}`,
    enabled: false,
    title: "Големият футболен giveaway",
    prize: "Опиши наградата",
    description: "Запиши се безплатно и участвай в тегленето на D.I.S Подкаст.",
    image: "./assets/giveaway-football.webp",
    startsAt: "",
    endsAt: "",
    winnerCount: 1,
    prizes: [{ id: `prize-${Date.now()}`, name: "Опиши наградата", quantity: 1, image: "" }],
    minAge: 18,
    region: "България",
    socialHandleRequired: false,
    requirements: ["Изпълни условията, описани в официалната giveaway публикация"],
    officialRules: "Участието е безплатно и е позволено по веднъж на човек. Победителят се избира на случаен принцип сред валидните участници и ще бъде потърсен по имейл.",
    privacyNotice: "D.I.S Подкаст обработва името, имейла и посочения социален профил само за провеждането на giveaway и връзка с победителя. Данните се изтриват след приключване на кампанията и предаването на наградата. За оттегляне на участието или изтриване на данните използвай страницата Контакт.",
    platformNotice: "Тази промоция не е спонсорирана, администрирана, одобрена или свързана с Instagram, Facebook, YouTube или TikTok. Тези платформи не носят отговорност за провеждането й."
  };
}

function adminLeagueId(value = "", fallback = `league-${Date.now()}`) {
  const normalized = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

function normalizeAdminLeagueCollection(value = {}) {
  const isCollection = Array.isArray(value.leagues);
  const source = isCollection ? value.leagues : [{ ...value, id: value.id || "general" }];
  const used = new Set();
  const leagues = source.map((item, index) => {
    const requested = adminLeagueId(item?.id, index === 0 ? "general" : `league-${index + 1}`);
    let id = requested;
    let suffix = 2;
    while (used.has(id)) id = `${requested}-${suffix++}`;
    used.add(id);
    return {
      id,
      enabled: item?.enabled !== false,
      title: String(item?.title || `Лига ${index + 1}`),
      description: String(item?.description || "Прогнозирай резултата и се изкачи в класацията."),
      seasonLabel: String(item?.seasonLabel || "D.I.S Сезон"),
      trophies: Array.isArray(item?.trophies) ? item.trophies : [],
      matches: Array.isArray(item?.matches) ? item.matches : []
    };
  });
  return {
    enabled: value.enabled !== false,
    title: isCollection ? String(value.title || "D.I.S Лиги на прогнозите") : "D.I.S Лиги на прогнозите",
    description: isCollection ? String(value.description || "Избери първенство и участвай в отделна класация.") : "Избери първенство и участвай в отделна класация.",
    leagues
  };
}

function adminSlug(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function adminNewsSlug(item = {}, index = 0) {
  if (item.slug) return adminSlug(item.slug);
  const dateSuffix = String(item.createdAt || "").replace(/\D/g, "").slice(0, 12);
  return `${adminSlug(item.title || "news") || "news"}-${dateSuffix || index + 1}`;
}

function compactNewsExcerpt(value = "", maxLength = 220) {
  const clean = String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trim()}…` : clean;
}

function normalizeAdminTeamMedia(value) {
  if (!value || typeof value !== "object" || !Number.isInteger(Number(value.id)) || Number(value.id) <= 0) return null;
  const id = Number(value.id);
  return {
    id,
    name: String(value.name || ""),
    code: String(value.code || ""),
    country: String(value.country || ""),
    national: Boolean(value.national),
    logo: `https://media.api-sports.io/football/teams/${id}.png`,
    source: "API-Football",
    resolvedAt: String(value.resolvedAt || new Date().toISOString())
  };
}

function readTeamMediaField(card, name) {
  try {
    return normalizeAdminTeamMedia(JSON.parse(value(card, name) || "null"));
  } catch {
    return null;
  }
}

function normalizeGiveawayPrizes(giveaway = {}) {
  const configured = Array.isArray(giveaway.prizes)
    ? giveaway.prizes.filter((prize) => String(prize?.name || "").trim())
    : [];
  if (configured.length) {
    return configured.map((prize, index) => ({
      id: prize.id || `prize-${Date.now()}-${index}`,
      name: String(prize.name || "Награда"),
      quantity: Math.max(1, Math.min(20, Number(prize.quantity) || 1)),
      image: String(prize.image || "")
    }));
  }
  return [{
    id: "legacy-prize",
    name: giveaway.prize || "Футболна награда",
    quantity: Math.max(1, Math.min(20, Number(giveaway.winnerCount) || 1)),
    image: ""
  }];
}

function giveawayWinnerCount(giveaway = {}) {
  return Math.min(20, normalizeGiveawayPrizes(giveaway).reduce((sum, prize) => sum + prize.quantity, 0));
}

const sectionFields = [
  ["socials", "Канали"],
  ["latest", "YouTube"],
  ["news", "Новини"],
  ["formats", "Формати"],
  ["discovery", "Още от D.I.S"],
  ["homeContact", "Начална контактна секция"],
  ["sponsors", "Партньори"],
  ["activeAds", "Активни реклами"],
  ["mediaKit", "Статистика"],
  ["contact", "Контакт"]
];

function setStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? "#ff8ea0" : "#38f27f";
}

function askConfirmation(message, options = {}) {
  confirmTitle.textContent = options.title || "Сигурен ли си?";
  confirmMessage.textContent = message;
  confirmOk.textContent = options.okLabel || "Потвърди";
  confirmOk.classList.toggle("is-danger", Boolean(options.danger));
  confirmAlt.textContent = options.altLabel || "";
  confirmAlt.hidden = !options.altLabel;
  confirmAlt.style.display = options.altLabel ? "" : "none";
  confirmModal.hidden = false;
  confirmOk.focus();

  return new Promise((resolve) => {
    pendingConfirmation = resolve;
  });
}

function closeConfirmation(answer) {
  if (!pendingConfirmation) return;
  confirmModal.hidden = true;
  confirmTitle.textContent = "Сигурен ли си?";
  confirmOk.textContent = "Потвърди";
  confirmOk.classList.remove("is-danger");
  confirmAlt.hidden = true;
  confirmAlt.style.display = "none";
  pendingConfirmation(answer);
  pendingConfirmation = null;
}

async function showInfo(message) {
  await askConfirmation(message, { okLabel: "Разбрах" });
}

async function showWinnerCelebration(winners = [], participantNames = []) {
  if (!winnerModal || !winnerModalNames || !winnerConfetti) return;
  const orderedWinners = [...winners].sort((first, second) => first.winnerRank - second.winnerRank);
  const reelNames = participantNames.length ? participantNames : orderedWinners.map((winner) => winner.name);
  const closeButton = winnerModal.querySelector(".button[data-winner-modal-close]");
  winnerModal.classList.toggle("has-many-winners", orderedWinners.length > 3);
  winnerModal.dataset.drawing = "true";
  if (closeButton) {
    closeButton.disabled = true;
    closeButton.textContent = orderedWinners.length === 1 ? "Виж участника" : "Виж победителите";
  }
  winnerModalCopy.textContent = "Имената се разбъркват. Победителят се избира със сигурното сървърно теглене...";
  winnerModalNames.innerHTML = orderedWinners
    .map((_, index) => `<div class="winner-reel"><small>Теглене #${index + 1}</small><strong>${escapeValue(reelNames[index % reelNames.length] || "...")}</strong></div>`)
    .join("");
  winnerConfetti.innerHTML = "";
  winnerModal.hidden = false;

  let tick = 0;
  winnerAnimationTimer = window.setInterval(() => {
    winnerModalNames.querySelectorAll("strong").forEach((name, index) => {
      name.textContent = reelNames[(tick * 3 + index * 5) % reelNames.length] || "...";
    });
    tick += 1;
  }, 85);
  await new Promise((resolve) => window.setTimeout(resolve, 1900));
  window.clearInterval(winnerAnimationTimer);
  winnerAnimationTimer = null;

  winnerModalCopy.textContent = winners.length === 1
    ? "Тегленето приключи успешно. Победителят е:"
    : "Тегленето приключи успешно. Победителите са:";
  winnerModalNames.innerHTML = orderedWinners
    .map((winner) => `<div><small>Победител #${Number(winner.winnerRank) || 1}</small><strong>${escapeValue(winner.name)}</strong>${winner.prizeName ? `<span class="winner-prize">${winner.prizeImage ? `<img src="${escapeValue(winner.prizeImage)}" alt="" />` : ""}<span><em>Спечелена награда</em><b>${escapeValue(winner.prizeName)}</b></span></span>` : ""}</div>`)
    .join("");
  winnerConfetti.innerHTML = Array.from({ length: 28 }, (_, index) =>
    `<i style="--confetti-x:${(index * 37) % 100}%;--confetti-delay:${(index % 7) * 70}ms;--confetti-rotate:${(index * 53) % 360}deg;--confetti-color:${["#38f27f", "#f4d44d", "#ffffff", "#ff465e"][index % 4]}"></i>`
  ).join("");
  winnerModal.dataset.drawing = "false";
  if (closeButton) {
    closeButton.disabled = false;
    closeButton.focus();
  }
}

function closeWinnerCelebration() {
  if (!winnerModal || winnerModal.dataset.drawing === "true") return;
  winnerModal.hidden = true;
  winnerConfetti.innerHTML = "";
  document.querySelector("[data-giveaway-entry-id].is-winner")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function removalLabel(type) {
  return (
    {
      nav: "този header линк",
      social: "този социален канал",
      format: "този формат",
      ad: "този рекламен формат",
      "active-ad": "тази активна реклама",
      media: "тази медия",
      news: "тази новина",
      stat: "тази статистика",
      package: "този рекламен пакет",
      prediction: "тази прогноза",
      poll: "това гласуване",
      league: "тази лига",
      "league-match": "този мач от админ панела",
      "league-trophy": "този трофей",
      giveaway: "този giveaway и всички записани участници",
      host: "този водещ",
      "footer-link": "този footer линк",
      "footer-social": "тази footer социална мрежа"
    }[type] || "този елемент"
  );
}

async function loadAdminContent({ rethrow = false } = {}) {
  try {
    const response = await fetch("/api/content", {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error("Content API unavailable");
    adminConfig = await response.json();
  } catch (error) {
    setStatus("Съдържанието не може да бъде заредено от сървъра.", true);
    if (rethrow) throw error;
  }

  adminConfig = withDefaults(adminConfig);
  savedConfig = structuredClone(adminConfig);
  renderEditors();
  await loadMessages();
}

function withDefaults(config) {
  const fallback = structuredClone(window.DIS_SITE_CONFIG);
  const sectionKeys = new Set([...Object.keys(fallback.sections || {}), ...Object.keys(config.sections || {})]);
  const sections = {};
  sectionKeys.forEach((key) => {
    sections[key] = { ...(fallback.sections?.[key] || {}), ...(config.sections?.[key] || {}) };
  });
  const rawGiveaway = config.giveaway === undefined ? (fallback.giveaway || null) : config.giveaway;
  const giveaway = rawGiveaway ? { ...rawGiveaway, prizes: normalizeGiveawayPrizes(rawGiveaway) } : null;
  const predictionLeague = normalizeAdminLeagueCollection(config.predictionLeague === undefined
    ? (fallback.predictionLeague || {})
    : config.predictionLeague);
  return {
    ...fallback,
    ...config,
    brand: { ...fallback.brand, ...(config.brand || {}) },
    hero: { ...fallback.hero, ...(config.hero || {}) },
    sections,
    sponsorPanel: { ...fallback.sponsorPanel, ...(config.sponsorPanel || {}) },
    pages: {
      fanZone: { ...(fallback.pages?.fanZone || {}), ...(config.pages?.fanZone || {}) },
      hosts: { ...(fallback.pages?.hosts || {}), ...(config.pages?.hosts || {}) },
      partners: { ...(fallback.pages?.partners || {}), ...(config.pages?.partners || {}) },
      contact: { ...(fallback.pages?.contact || {}), ...(config.pages?.contact || {}) }
    },
    footer: {
      ...(fallback.footer || {}),
      ...(config.footer || {}),
      links: config.footer?.links || fallback.footer?.links || [],
      socials: config.footer?.socials || fallback.footer?.socials || []
    },
    nav: config.nav || fallback.nav || [],
    ticker: config.ticker || fallback.ticker || [],
    socials: config.socials || fallback.socials || [],
    youtubePlayer: { ...fallback.youtubePlayer, ...(config.youtubePlayer || {}) },
    news: (config.news || fallback.news || []).map((item, index) => ({
      ...item,
      slug: adminNewsSlug(item, index),
      excerpt: String(item.excerpt || compactNewsExcerpt(item.body || ""))
    })),
    formats: config.formats || fallback.formats || [],
    adSlots: config.adSlots || fallback.adSlots || [],
    activeAds: config.activeAds || fallback.activeAds || [],
    stats: config.stats || fallback.stats || [],
    sponsorPackages: config.sponsorPackages || fallback.sponsorPackages || [],
    hosts: config.hosts || fallback.hosts || [],
    predictions: config.predictions || fallback.predictions || [],
    polls: config.polls || fallback.polls || [],
    predictionLeague,
    giveaway,
    mediaLibrary: config.mediaLibrary || fallback.mediaLibrary || []
  };
}

function escapeValue(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function field(label, name, value = "", type = "text") {
  return `
    <label class="mini-field">
      <span>${label}</span>
      <input name="${name}" type="${type}" value="${escapeValue(value)}" />
    </label>
  `;
}

function numberField(label, name, value = "", min = 0, max = 30) {
  return `
    <label class="mini-field">
      <span>${label}</span>
      <input name="${name}" type="number" min="${min}" max="${max}" step="1" value="${escapeValue(value)}" />
    </label>
  `;
}

function hiddenField(name, value = "") {
  return `<input name="${name}" type="hidden" value="${escapeValue(value)}" />`;
}

function teamMediaPicker(label, nameField, mediaField, mediaValue) {
  const media = normalizeAdminTeamMedia(mediaValue);
  return `
    <div class="team-media-picker wide" data-team-media-picker data-name-field="${escapeValue(nameField)}" data-media-field="${escapeValue(mediaField)}">
      ${hiddenField(mediaField, media ? JSON.stringify(media) : "")}
      <div class="team-media-selection" data-team-media-selection>
        ${media ? `<img src="${escapeValue(media.logo)}" alt="" /><span><strong>${escapeValue(media.name)}</strong><small>${escapeValue([media.country, media.code].filter(Boolean).join(" · "))} · API-Football</small></span>` : `<span><strong>${escapeValue(label)}</strong><small>Няма избрано автоматично лого</small></span>`}
      </div>
      <div class="team-media-actions">
        <button class="button secondary" data-team-media-search type="button">Намери лого / флаг</button>
        <button class="button secondary" data-team-media-clear type="button" ${media ? "" : "hidden"}>Премахни</button>
      </div>
      <small class="team-media-note">Търсенето е в API-Football. Провери предложението и го избери ръчно преди запис.</small>
      <div class="team-media-results" data-team-media-results hidden></div>
    </div>`;
}

function updateTeamMediaPicker(picker, mediaValue) {
  const media = normalizeAdminTeamMedia(mediaValue);
  const hidden = picker.querySelector(`[name="${picker.dataset.mediaField}"]`);
  const selection = picker.querySelector("[data-team-media-selection]");
  const clearButton = picker.querySelector("[data-team-media-clear]");
  if (hidden) hidden.value = media ? JSON.stringify(media) : "";
  if (selection) {
    selection.innerHTML = media
      ? `<img src="${escapeValue(media.logo)}" alt="" /><span><strong>${escapeValue(media.name)}</strong><small>${escapeValue([media.country, media.code].filter(Boolean).join(" · "))} · API-Football</small></span>`
      : `<span><strong>Автоматично лого</strong><small>Няма избрано автоматично лого</small></span>`;
  }
  if (clearButton) clearButton.hidden = !media;
}

function showTeamMediaResults(picker, results = [], message = "") {
  const container = picker.querySelector("[data-team-media-results]");
  if (!container) return;
  teamMediaSearchResults.set(picker, results);
  container.hidden = false;
  container.innerHTML = results.length
    ? results.map((team, index) => `
      <button type="button" data-team-media-result="${index}">
        <img src="${escapeValue(team.logo)}" alt="" />
        <span><strong>${escapeValue(team.name)}</strong><small>${escapeValue([team.country, team.code, team.national ? "национален отбор" : "клуб"].filter(Boolean).join(" · "))}</small></span>
      </button>`).join("")
    : `<p>${escapeValue(message || "Няма намерени предложения. Опитай с част от името на латиница.")}</p>`;
}

function readonlyInfo(label, value = "") {
  return `
    <div class="mini-field readonly-field">
      <span>${label}</span>
      <p>${escapeValue(value)}</p>
    </div>
  `;
}

function readonlyLinkInfo(label, href = "") {
  return `
    <div class="mini-field readonly-field wide">
      <span>${label}</span>
      <div class="readonly-link-row">
        <a href="${escapeValue(href)}" target="_blank" rel="noopener noreferrer">${escapeValue(href)}</a>
        <button class="button secondary" data-copy-link="${escapeValue(href)}" type="button">Копирай</button>
      </div>
    </div>
  `;
}

function fileField(label, accept, target = "") {
  const profile = imageUploadProfile(target);
  const imageHint = accept.includes("image/") ? `<small>Снимките се оптимизират автоматично до ${profile.label}.</small>` : "";
  return `
    <label class="mini-field upload-field">
      <span>${label}</span>
      <input data-upload ${target ? `data-upload-target="${escapeValue(target)}"` : ""} type="file" accept="${accept}" />
      ${imageHint}
      <small class="upload-feedback" data-upload-feedback role="status" aria-live="polite"></small>
    </label>
  `;
}

function imageUploadProfile(target = "") {
  const isHeroOrBrand = !target || target === "sections.news.image" || target === "giveaway.image" || /^pages\.[^.]+\.image$/.test(target);
  return isHeroOrBrand ? imageUploadProfiles.hero : imageUploadProfiles.content;
}

function setUploadState(input, state, message) {
  const field = input?.closest(".upload-field");
  if (!field) return;
  field.classList.toggle("is-uploading", state === "loading");
  field.classList.toggle("has-upload-error", state === "error");
  field.classList.toggle("has-upload-success", state === "success");
  field.toggleAttribute("aria-busy", state === "loading");
  input.disabled = state === "loading";
  const feedback = field.querySelector("[data-upload-feedback]");
  if (feedback) feedback.textContent = message || "";
}

function findUploadInput(target) {
  return [...document.querySelectorAll("[data-upload]")]
    .find((input) => (input.dataset.uploadTarget || "") === target);
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function checkboxField(label, name, checked = false) {
  return `
    <label class="mini-field checkbox-field">
      <input name="${name}" type="checkbox" ${checked ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function selectField(label, name, value, options) {
  return `
    <label class="mini-field">
      <span>${label}</span>
      <select name="${name}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeValue(optionValue)}" ${value === optionValue ? "selected" : ""}>${escapeValue(optionLabel)}</option>`).join("")}
      </select>
    </label>
  `;
}

function leagueTrophyConditionDescription(condition) {
  return leagueTrophyConditions.find(([value]) => value === condition)?.[2] || leagueTrophyConditions[0][2];
}

function updateLeagueTrophyCard(card) {
  if (!card) return;
  const label = value(card, "label").trim() || "Нов трофей";
  const tier = value(card, "tier") || "bronze";
  const condition = value(card, "condition") || "exact";
  const preview = card.querySelector(".admin-trophy-preview .league-badge");
  const previewLabel = card.querySelector("[data-admin-trophy-label]");
  const previewNote = card.querySelector("[data-admin-trophy-condition]");
  const heading = card.querySelector("h3");
  if (heading) heading.textContent = label;
  if (previewLabel) previewLabel.textContent = label;
  if (previewNote) previewNote.textContent = leagueTrophyConditionDescription(condition);
  if (preview) {
    leagueTrophyTiers.forEach(([level]) => preview.classList.remove(`tier-${level}`));
    preview.classList.add(`tier-${tier}`);
  }
}

function inboxStatusField(value) {
  const options = [["new", "Ново"], ["read", "Прегледано"], ["in-progress", "В процес"], ["done", "Приключено"], ["archived", "Архивирано"]];
  const current = options.find(([optionValue]) => optionValue === value) || options[0];
  return `
    <div class="mini-field inbox-status-field">
      <span>Статус</span>
      <div class="admin-custom-select" data-admin-custom-select>
        <input name="messageStatus" type="hidden" value="${escapeValue(current[0])}" />
        <button class="admin-custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span data-admin-select-label>${escapeValue(current[1])}</span><i aria-hidden="true"></i>
        </button>
        <div class="admin-custom-select-menu" role="listbox" hidden>
          ${options.map(([optionValue, optionLabel]) => `<button class="${current[0] === optionValue ? "is-selected" : ""}" type="button" role="option" aria-selected="${current[0] === optionValue}" data-admin-select-value="${escapeValue(optionValue)}">${escapeValue(optionLabel)}</button>`).join("")}
        </div>
      </div>
    </div>`;
}

function mediaPreview(url = "", type = "") {
  if (!url) return `<p class="upload-note">Няма качен файл.</p>`;
  if (type === "video") {
    return `<video class="upload-preview" src="${escapeValue(url)}" controls muted></video>`;
  }
  return `<img class="upload-preview" src="${escapeValue(url)}" alt="Качена медия" />`;
}

function mediaLibrary(target, allowedTypes, selectedUrl = "") {
  const items = (adminConfig.mediaLibrary || []).filter((item) => allowedTypes.includes(item.type));
  if (!items.length) return `<p class="upload-note wide">Все още няма добавени медии. Качи файл, после го избери оттук.</p>`;

  return `
    <div class="media-library wide">
      ${items
        .map(
          (item) => `
            <article class="media-library-card ${item.url === selectedUrl ? "is-selected" : ""}" data-select-media="${escapeValue(target)}" data-media-url="${escapeValue(item.url)}" data-media-type="${escapeValue(item.type)}" role="button" tabindex="0">
              ${item.url === selectedUrl ? "" : `<button class="remove-card media-remove" data-delete-media="${escapeValue(item.filename)}" type="button" aria-label="Изтрий медия">x</button>`}
              ${mediaPreview(item.url, item.type)}
              <strong>${escapeValue(item.name || item.filename || "media")}</strong>
              <span>${item.url === selectedUrl ? "Избрана" : "Добавена, не е избрана"}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function brandMediaLibrary() {
  const items = getBrandImages();
  if (!items.length) return `<p class="upload-note wide">Все още няма добавени снимки.</p>`;

  return `
    <div class="brand-media-box wide">
      <span class="upload-title">Добавени снимки</span>
      <div class="media-library">
        ${items
          .map((item) => {
            const isLogo = item.url === adminConfig.brand?.logo;
            const isHero = item.url === adminConfig.brand?.heroImage;
            const selectedLabel = [isLogo ? "Лого" : "", isHero ? "Background" : ""].filter(Boolean).join(" + ");
            return `
              <article class="media-library-card ${isLogo || isHero ? "is-selected" : ""}" data-select-brand-media="${escapeValue(item.url)}" data-media-type="image" role="button" tabindex="0">
                ${isLogo || isHero ? "" : `<button class="remove-card media-remove" data-delete-media="${escapeValue(item.filename)}" type="button" aria-label="Изтрий медия">x</button>`}
                ${mediaPreview(item.url, "image")}
                <strong>${escapeValue(item.name || item.filename || "снимка")}</strong>
                <span>${selectedLabel ? `Избрана: ${selectedLabel}` : "Добавена, не е избрана"}</span>
              </article>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function getBrandImages() {
  ensureSelectedBrandMedia();
  const byUrl = new Map();
  (adminConfig.mediaLibrary || [])
    .filter((item) => item.type === "image" && item.url)
    .forEach((item) => {
      if (!byUrl.has(item.url)) byUrl.set(item.url, item);
    });
  return [...byUrl.values()];
}

function ensureSelectedBrandMedia() {
  adminConfig.mediaLibrary = adminConfig.mediaLibrary || [];
  upsertMediaFromUrl(adminConfig.brand?.logo, "image", "Текущо лого");
  upsertMediaFromUrl(adminConfig.brand?.heroImage, "image", "Текущ hero background");
}

function upsertMediaFromUrl(url, type, name) {
  if (!url || (adminConfig.mediaLibrary || []).some((item) => item.url === url)) return;
  const filename = url.split("/").filter(Boolean).pop() || url;
  adminConfig.mediaLibrary.push({
    filename,
    name,
    type,
    url,
    createdAt: new Date().toISOString()
  });
}

function textarea(label, name, value = "", rows = 3) {
  return `
    <label class="mini-field wide">
      <span>${label}</span>
      <textarea name="${name}" rows="${rows}">${escapeValue(value)}</textarea>
    </label>
  `;
}

function pageEditorMarkup(key, title) {
  const page = adminConfig.pages?.[key] || {};
  const extraFields = pageExtraFields(key)
    .map(([name, label, multiline]) => multiline ? textarea(label, name, page[name] || "", 3) : field(label, name, page[name] || ""))
    .join("");
  return `
    <article class="editor-card">
      <h3>${escapeValue(title)}</h3>
      ${field("Kicker", "kicker", page.kicker || "")}
      ${field("Заглавие", "title", page.title || "")}
      ${textarea("Описание", "description", page.description || "", 4)}
      ${extraFields}
      ${hiddenField("image", page.image || "")}
      ${fileField("Качи нов hero background", "image/*", `pages.${key}.image`)}
      <div class="wide"><span class="upload-title">Текущ hero background</span>${mediaPreview(page.image || "", "image")}</div>
    </article>`;
}

function pageExtraFields(key) {
  return {
    fanZone: [
      ["predictionsKicker", "Прогнози - kicker", false], ["predictionsTitle", "Прогнози - заглавие", false], ["predictionsDescription", "Прогнози - описание", true],
      ["voteKicker", "Voting - kicker", false], ["voteTitle", "Voting - заглавие", false], ["voteDescription", "Voting - описание", true],
      ["ideaKicker", "Фен идея - kicker", false], ["ideaTitle", "Фен идея - заглавие", false], ["ideaDescription", "Фен идея - описание", true]
    ],
    hosts: [["sectionKicker", "Профили - kicker", false], ["sectionTitle", "Профили - заглавие", false], ["sectionDescription", "Профили - описание", true]],
    partners: [
      ["adsKicker", "Рекламни формати - kicker", false], ["adsTitle", "Рекламни формати - заглавие", false], ["adsDescription", "Рекламни формати - описание", true],
      ["ctaKicker", "Финален CTA - kicker", false], ["ctaTitle", "Финален CTA - заглавие", false], ["ctaDescription", "Финален CTA - описание", true]
    ],
    contact: [["formKicker", "Форма - kicker", false], ["formTitle", "Форма - заглавие", false], ["formDescription", "Форма - описание", true]]
  }[key] || [];
}

function dateTimeLocalValue(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function renderEditors() {
  const brand = adminConfig.brand || {};
  ensureSelectedBrandMedia();
  document.title = `${brand.name || "D.I.S"} Admin Studio`;
  document.querySelector('link[rel="icon"]')?.setAttribute("href", brand.logo || "./assets/dis-logo.png");
  document.querySelector(".admin-hero .brand-mark img")?.setAttribute("src", brand.logo || "./assets/dis-logo.png");

  brandEditor.innerHTML = `
    <article class="editor-card">
      <h3>Бранд настройки</h3>
      ${field("Име на сайта", "name", brand.name)}
      ${hiddenField("logo", brand.logo)}
      ${hiddenField("heroImage", brand.heroImage)}
      ${fileField("Качи нова снимка", "image/*")}
      <div class="upload-preview-grid wide">
        <div>
          <span>Текущо лого</span>
          ${mediaPreview(brand.logo, "image")}
        </div>
        <div>
          <span>Текущ hero background</span>
          ${mediaPreview(brand.heroImage, "image")}
        </div>
      </div>
      ${brandMediaLibrary()}
    </article>
  `;

  navEditor.innerHTML = (adminConfig.nav || [])
    .map(
      (item, index) => `
        <article class="editor-card" data-index="${index}">
          <h3>${escapeValue(item.label || "Header link")}</h3>
          ${field("Текст", "label", item.label)}
          ${field("Линк", "href", item.href)}
        </article>
      `
    )
    .join("");

  const hero = adminConfig.hero || {};
  heroEditor.innerHTML = `
    <article class="editor-card">
      <h3>Hero съдържание</h3>
      ${field("Малък надпис", "eyebrow", hero.eyebrow)}
      ${field("Главно заглавие", "title", hero.title)}
      ${textarea("Описание", "copy", hero.copy)}
      ${field("Primary бутон", "primaryLabel", hero.primaryLabel)}
      ${field("Primary линк", "primaryUrl", hero.primaryUrl)}
      ${field("Secondary бутон", "secondaryLabel", hero.secondaryLabel)}
      ${field("Secondary линк", "secondaryUrl", hero.secondaryUrl)}
      ${textarea("Летящи думички - един ред = една дума/фраза", "chips", (hero.chips || []).join("\n"), 4)}
    </article>
  `;

  sectionEditors.forEach((editor) => {
    const keys = (editor.dataset.sectionKeys || "").split(",").filter(Boolean);
    editor.innerHTML = sectionFields
      .filter(([key]) => keys.includes(key))
      .map(([key, label]) => {
        const section = adminConfig.sections?.[key] || {};
        return `
          <article class="editor-card" data-section="${key}">
            <h3>${label}</h3>
            ${key === "contact" ? field("Контактен имейл", "email", section.email || "", "email") : `${field("Kicker", "kicker", section.kicker)}${field("Заглавие", "title", section.title)}${textarea("Описание", "description", section.description || "")}`}
            ${key === "news" ? `${hiddenField("image", section.image || "")}${fileField("Качи news hero background", "image/*", "sections.news.image")}<div class="wide"><span class="upload-title">Текущ news hero</span>${mediaPreview(section.image || "", "image")}</div>` : ""}
          </article>
        `;
      })
      .join("");
  });

  fanPageEditor.innerHTML = pageEditorMarkup("fanZone", "Фен зона");
  hostsPageEditor.innerHTML = pageEditorMarkup("hosts", "Водещи");
  partnersPageEditor.innerHTML = pageEditorMarkup("partners", "Партньорства");
  contactPageEditor.innerHTML = pageEditorMarkup("contact", "Контакт");

  const predictionLeague = normalizeAdminLeagueCollection(adminConfig.predictionLeague || {});
  adminConfig.predictionLeague = predictionLeague;
  if (!predictionLeague.leagues.some((league) => league.id === adminSelectedLeagueId)) {
    adminSelectedLeagueId = predictionLeague.leagues[0]?.id || "";
  }
  const selectedLeague = predictionLeague.leagues.find((league) => league.id === adminSelectedLeagueId) || null;

  leagueListEditor.innerHTML = predictionLeague.leagues.length
    ? predictionLeague.leagues.map((league, index) => `
      <article class="admin-league-card ${league.id === adminSelectedLeagueId ? "is-active" : ""}" data-index="${index}">
        <button class="admin-league-select" type="button" data-admin-league-select="${escapeValue(league.id)}" aria-pressed="${league.id === adminSelectedLeagueId}">
          <span>${league.enabled === false ? "Скрита" : "Активна"}</span>
          <strong>${escapeValue(league.title)}</strong>
          <small>${escapeValue(league.seasonLabel)} · ${(league.matches || []).length} ${(league.matches || []).length === 1 ? "мач" : "мача"}</small>
        </button>
        <button class="remove-card" data-remove="league" type="button" aria-label="Премахни лигата">x</button>
      </article>`).join("")
    : `<article class="empty-state">Няма създадени лиги. Натисни „Добави лига“.</article>`;

  leagueSettingsEditor.innerHTML = `
    <article class="editor-card" data-league-hub-settings>
      <h3>Общи настройки</h3>
      ${checkboxField("Покажи лигите на прогнозите във Фен зоната", "hubEnabled", predictionLeague.enabled !== false)}
      ${field("Общо заглавие", "hubTitle", predictionLeague.title || "D.I.S Лиги на прогнозите")}
      ${textarea("Общо описание", "hubDescription", predictionLeague.description || "", 3)}
    </article>
    ${selectedLeague ? `<article class="editor-card" data-league-settings>
      <h3>${escapeValue(selectedLeague.title)}</h3>
      ${hiddenField("id", selectedLeague.id)}
      ${checkboxField("Покажи тази лига", "enabled", selectedLeague.enabled !== false)}
      ${field("Име на лигата", "title", selectedLeague.title)}
      ${textarea("Кратко описание", "description", selectedLeague.description || "", 3)}
      ${field("Име на сезона", "seasonLabel", selectedLeague.seasonLabel || "D.I.S Сезон 2026/27")}
      ${readonlyInfo("Точкуване", "Победител или равенство: 3 т. · Точен резултат: още 7 т. · Всеки 3 поредни правилни: +2 т.")}
    </article>` : ""}`;

  leagueTrophiesEditor.innerHTML = (selectedLeague?.trophies || []).map((trophy, index) => {
    const condition = leagueTrophyConditions.some(([value]) => value === trophy.condition) ? trophy.condition : "exact";
    const tier = leagueTrophyTiers.some(([value]) => value === trophy.tier) ? trophy.tier : "bronze";
    const label = trophy.label || `Трофей ${index + 1}`;
    return `
      <article class="editor-card league-trophy-editor" data-index="${index}">
        <button class="remove-card" data-remove="league-trophy" type="button" aria-label="Премахни">x</button>
        <h3>${escapeValue(label)}</h3>
        ${hiddenField("id", trophy.id || `trophy-${Date.now()}-${index}`)}
        ${field("Име на трофея", "label", label)}
        ${selectField("Как се печели", "condition", condition, leagueTrophyConditions.map(([value, optionLabel]) => [value, optionLabel]))}
        ${selectField("Трудност и цвят", "tier", tier, leagueTrophyTiers.map(([value, optionLabel]) => [value, optionLabel]))}
        <div class="admin-trophy-preview wide">
          <span class="league-badge tier-${tier}"><i aria-hidden="true"></i><span data-admin-trophy-label>${escapeValue(label)}</span></span>
          <small data-admin-trophy-condition>${escapeValue(leagueTrophyConditionDescription(condition))}</small>
        </div>
      </article>`;
  }).join("");

  leagueMatchesEditor.innerHTML = (selectedLeague?.matches || []).map((match, index) => {
    const resultHome = match.result?.homeScore ?? "";
    const resultAway = match.result?.awayScore ?? "";
    return `
      <article class="editor-card league-match-editor" data-index="${index}">
        <button class="remove-card" data-remove="league-match" type="button" aria-label="Премахни">x</button>
        <h3>${escapeValue(`${match.homeTeam || "Отбор A"} – ${match.awayTeam || "Отбор B"}`)}</h3>
        ${hiddenField("id", match.id || `league-match-${Date.now()}-${index}`)}
        ${checkboxField("Покажи този мач", "enabled", match.enabled !== false)}
        ${field("Турнир / кръг", "competition", match.competition || "D.I.S Matchday")}
        ${field("Домакин", "homeTeam", match.homeTeam || "")}
        ${teamMediaPicker("Лого на домакина", "homeTeam", "homeTeamMedia", match.homeTeamMedia)}
        ${field("Гост", "awayTeam", match.awayTeam || "")}
        ${teamMediaPicker("Лого на госта", "awayTeam", "awayTeamMedia", match.awayTeamMedia)}
        ${field("Начало на мача / край за прогнози", "kickoffAt", dateTimeLocalValue(match.kickoffAt), "datetime-local")}
        ${checkboxField("Дерби мач", "isDerby", Boolean(match.isDerby))}
        ${numberField("Краен резултат – домакин", "resultHome", resultHome)}
        ${numberField("Краен резултат – гост", "resultAway", resultAway)}
        <p class="form-privacy-note wide">Остави крайния резултат празен, докато мачът не приключи. След като го запазиш, можеш да премахнеш мача от админ панела — спечелените точки и статистиката ще останат.</p>
      </article>`;
  }).join("");

  const footer = adminConfig.footer || {};
  footerEditor.innerHTML = `
    <article class="editor-card">
      <h3>Footer настройки</h3>
      ${field("Контактен имейл", "email", footer.email || "", "email")}
      ${textarea("Кратко описание", "description", footer.description || "", 3)}
    </article>`;

  footerLinksEditor.innerHTML = (footer.links || []).map((item, index) => `
    <article class="editor-card" data-index="${index}">
      <button class="remove-card" data-remove="footer-link" type="button" aria-label="Премахни">x</button>
      <h3>${escapeValue(item.label || "Footer линк")}</h3>
      ${field("Текст", "label", item.label || "")}
      ${field("Линк", "href", item.href || "")}
    </article>`).join("");

  footerSocialsEditor.innerHTML = (footer.socials || []).map((item, index) => `
    <article class="editor-card" data-index="${index}">
      <button class="remove-card" data-remove="footer-social" type="button" aria-label="Премахни">x</button>
      <h3>${escapeValue(item.name || "Социална мрежа")}</h3>
      ${field("Име на платформата", "name", item.name || "")}
      ${field("URL", "url", item.url || "", "url")}
    </article>`).join("");

  tickerInput.value = (adminConfig.ticker || []).join("\n");

  socialsEditor.innerHTML = (adminConfig.socials || [])
    .map(
      (item, index) => `
        <article class="editor-card" data-index="${index}">
          <button class="remove-card" data-remove="social" type="button" aria-label="Премахни">x</button>
          <h3>${escapeValue(item.name || "Канал")}</h3>
          ${field("Име", "name", item.name)}
          ${field("Handle", "handle", item.handle)}
          ${field("URL", "url", item.url, "url")}
          ${field("Икона fallback", "icon", item.icon)}
          ${textarea("Кратко описание", "label", item.label)}
        </article>
      `
    )
    .join("");

  const youtubePlayer = adminConfig.youtubePlayer || {};
  youtubeEditor.innerHTML = `
    <article class="editor-card">
      <h3>YouTube player</h3>
      ${field("Заглавие", "title", youtubePlayer.title || "")}
      ${field("URL към YouTube видео", "url", youtubePlayer.url || "", "url")}
      ${textarea("Описание", "description", youtubePlayer.description || "")}
    </article>
  `;

  newsEditor.innerHTML = (adminConfig.news || [])
    .map(
      (item, index) => {
        const slug = adminNewsSlug(item, index);
        return `
        <article class="editor-card" data-index="${index}">
          <button class="remove-card" data-remove="news" type="button" aria-label="Премахни">x</button>
          <h3>${escapeValue(item.title || "Новина")}</h3>
          ${hiddenField("slug", slug)}
          ${field("Заглавие", "title", item.title || "")}
          ${readonlyInfo("Дата - автоматично", formatAdminDate(item.createdAt))}
          ${readonlyLinkInfo("Публична detail страница", `${window.location.origin}/news/${slug}`)}
          ${textarea("Кратко резюме за картата и Story share", "excerpt", item.excerpt || compactNewsExcerpt(item.body || ""), 4)}
          ${textarea("Пълен текст на новината", "body", item.body || "", 10)}
          ${field("Надпис под снимката (по желание)", "imageCaption", item.imageCaption || "")}
          ${hiddenField("imageUrl", item.imageUrl || "")}
          ${fileField("Качи снимка", "image/*", `news.${index}.image`)}
          <div class="wide">
            <span class="upload-title">Снимка към новината</span>
            ${mediaPreview(item.imageUrl || "", "image")}
          </div>
        </article>
      `;
      }
    )
    .join("");

  formatsEditor.innerHTML = (adminConfig.formats || [])
    .map(
      (item, index) => `
        <article class="editor-card" data-index="${index}">
          <button class="remove-card" data-remove="format" type="button" aria-label="Премахни">x</button>
          <h3>${escapeValue(item.title || "Формат")}</h3>
          ${field("Номер/етикет", "number", item.number)}
          ${field("Заглавие", "title", item.title)}
          ${textarea("Описание", "description", item.description)}
          ${textarea("Акценти - един ред = една точка", "items", (item.items || []).join("\n"))}
        </article>
      `
    )
    .join("");

  predictionsEditor.innerHTML = (adminConfig.predictions || [])
    .map((item, index) => `
      <article class="editor-card" data-index="${index}">
        <button class="remove-card" data-remove="prediction" type="button" aria-label="Премахни">x</button>
        <h3>${escapeValue(item.match || "Прогноза")}</h3>
        ${hiddenField("id", item.id || `prediction-${Date.now()}-${index}`)}
        ${field("Водещ", "host", item.host || "")}
        ${field("Мач", "match", item.match || "")}
        ${field("Прогноза / резултат", "prediction", item.prediction || "")}
        ${textarea("Свободен коментар", "analysis", item.analysis || "", 4)}
        ${readonlyInfo("Добавена", formatAdminDate(item.createdAt))}
      </article>`)
    .join("");

  pollsEditor.innerHTML = (adminConfig.polls || [])
    .map((poll, index) => `
      <article class="editor-card" data-index="${index}">
        <button class="remove-card" data-remove="poll" type="button" aria-label="Премахни">x</button>
        <h3>${escapeValue(poll.match || "Гласуване")}</h3>
        ${hiddenField("id", poll.id || `poll-${Date.now()}-${index}`)}
        ${field("Етикет", "title", poll.title || "")}
        ${field("Кой срещу кой", "match", poll.match || "")}
        ${field("Въпрос", "question", poll.question || "")}
        ${selectField("Статус", "status", poll.status || "active", [["active", "Активно"], ["closed", "Приключило"]])}
        ${checkboxField("Показвай резултатите преди гласуване", "resultsVisible", Boolean(poll.resultsVisible))}
        ${field("Краен срок (по желание)", "closesAt", dateTimeLocalValue(poll.closesAt), "datetime-local")}
        <div class="admin-poll-options wide">
          <div class="admin-poll-options-heading"><span class="upload-title">Опции и лога</span><button class="button secondary" data-add-poll-option type="button">Добави опция</button></div>
          ${(poll.options || []).map((option, optionIndex) => `
            <article class="admin-poll-option" data-poll-option-index="${optionIndex}">
              <button class="remove-card" data-remove-poll-option type="button" aria-label="Премахни опция">x</button>
              ${hiddenField("optionId", option.id || `option-${Date.now()}-${optionIndex}`)}
              ${field("Текст на опцията", "optionLabel", option.label || "")}
              ${teamMediaPicker("Лого / флаг на опцията", "optionLabel", "optionMedia", option.media)}
            </article>`).join("")}
        </div>
      </article>`)
    .join("");

  const giveaway = adminConfig.giveaway;
  const giveawayPrizes = giveaway ? normalizeGiveawayPrizes(giveaway) : [];
  giveawayEditor.innerHTML = giveaway ? `
    <article class="editor-card giveaway-editor-card">
      <button class="remove-card" data-remove="giveaway" type="button" aria-label="Премахни giveaway">x</button>
      <h3>${escapeValue(giveaway.title || "Giveaway")}</h3>
      ${hiddenField("id", giveaway.id || `giveaway-${Date.now()}`)}
      ${checkboxField("Покажи giveaway в сайта", "enabled", Boolean(giveaway.enabled))}
      ${field("Заглавие", "title", giveaway.title || "")}
      ${textarea("Кратко описание", "description", giveaway.description || "", 4)}
      ${field("Начало (по желание)", "startsAt", dateTimeLocalValue(giveaway.startsAt), "datetime-local")}
      ${field("Край", "endsAt", dateTimeLocalValue(giveaway.endsAt), "datetime-local")}
      <div class="giveaway-prize-admin wide">
        <div class="giveaway-prize-admin-heading">
          <div><span class="upload-title">Награди</span><small>Количеството определя колко победители ще бъдат изтеглени.</small></div>
          <button class="button secondary" data-add-giveaway-prize type="button">Добави награда</button>
        </div>
        <div class="giveaway-prize-editor-list">
          ${giveawayPrizes.map((prize, index) => `
            <article class="giveaway-prize-editor" data-prize-index="${index}">
              <button class="remove-card" data-remove-giveaway-prize type="button" aria-label="Премахни награда">x</button>
              <h4>Награда ${index + 1}</h4>
              ${hiddenField("prizeId", prize.id)}
              ${field("Име на наградата", "prizeName", prize.name)}
              ${field("Брой", "prizeQuantity", prize.quantity, "number")}
              ${hiddenField("prizeImage", prize.image || "")}
              ${fileField("Снимка (по желание)", "image/*", `giveaway.prizes.${index}.image`)}
              <div class="mini-field giveaway-prize-preview"><span>Текуща снимка</span>${mediaPreview(prize.image || "", "image")}${prize.image ? `<button class="button secondary" data-remove-giveaway-prize-image type="button">Изтрий снимката</button>` : ""}</div>
            </article>`).join("")}
        </div>
      </div>
      ${field("Минимална възраст (по желание)", "minAge", giveaway.minAge ?? "", "number")}
      ${field("Допустима територия (по желание)", "region", giveaway.region || "")}
      ${checkboxField("Изисквай профил в социална мрежа", "socialHandleRequired", Boolean(giveaway.socialHandleRequired))}
      ${readonlyLinkInfo("Директен линк към формата", "https://dis-podcast.onrender.com/fan-zone#giveaway")}
      ${readonlyInfo("Проверка на условията", "Следване, харесване и други действия в социалните мрежи се проверяват ръчно преди тегленето.")}
      ${textarea("Условия - едно на ред; линк: Текст | https://...", "requirements", (giveaway.requirements || []).join("\n"), 5)}
      ${textarea("Официални правила", "officialRules", giveaway.officialRules || "", 7)}
      ${textarea("Информация за личните данни", "privacyNotice", giveaway.privacyNotice || "", 6)}
      ${textarea("Уточнение за социалните платформи", "platformNotice", giveaway.platformNotice || "", 4)}
      ${hiddenField("image", giveaway.image || "")}
      ${fileField("Качи giveaway снимка", "image/*", "giveaway.image")}
      <div class="wide"><span class="upload-title">Текуща giveaway снимка</span>${mediaPreview(giveaway.image || "./assets/giveaway-football.webp", "image")}</div>
    </article>` : `<article class="empty-state">Няма създаден giveaway. Натисни „Създай giveaway“, попълни условията и го активирай, когато е готов.</article>`;

  loadGiveawayEntries();

  hostsEditor.innerHTML = (adminConfig.hosts || [])
    .map((host, index) => `
      <article class="editor-card" data-index="${index}">
        <button class="remove-card" data-remove="host" type="button" aria-label="Премахни">x</button>
        <h3>${escapeValue(host.name || "Водещ")}</h3>
        ${field("Име", "name", host.name || "")}
        ${field("Роля", "role", host.role || "")}
        ${textarea("Кратко представяне", "bio", host.bio || "", 5)}
        ${field("Любим отбор", "favoriteTeam", host.favoriteTeam || "")}
        ${field("Любим играч", "favoritePlayer", host.favoritePlayer || "")}
        ${field("Любим футболен момент", "footballMemory", host.footballMemory || "")}
        ${field("Футболна гледна точка", "matchStyle", host.matchStyle || "")}
        ${hiddenField("imageUrl", host.imageUrl || "")}
        ${fileField("Качи снимка (по желание)", "image/*", `hosts.${index}.image`)}
        <div class="wide host-image-preview">
          <span class="upload-title">Снимка на водещия</span>
          ${mediaPreview(host.imageUrl || "", "image")}
          ${host.imageUrl ? `<button class="button secondary host-image-remove" data-remove-host-image="${index}" type="button">Изтрий снимката</button>` : ""}
        </div>
      </article>`)
    .join("");

  const sponsorPanel = adminConfig.sponsorPanel || {};
  sponsorPanelEditor.innerHTML = `
    <article class="editor-card">
      <h3>Partner panel</h3>
      ${field("Малък етикет", "label", sponsorPanel.label)}
      ${field("Заглавие", "title", sponsorPanel.title)}
      ${textarea("Описание", "description", sponsorPanel.description)}
      ${hiddenField("image", sponsorPanel.image || "./assets/partner-placement-football-media.webp")}
    </article>
  `;

  adsEditor.innerHTML = (adminConfig.adSlots || [])
    .map(
      (item, index) => `
        <article class="editor-card" data-index="${index}">
          <button class="remove-card" data-remove="ad" type="button" aria-label="Премахни">x</button>
          <h3>${escapeValue(item.title || "Рекламен формат")}</h3>
          ${field("Формат", "format", item.format)}
          ${field("Заглавие", "title", item.title)}
          ${textarea("Описание", "description", item.description)}
        </article>
      `
    )
    .join("");

  activeAdsEditor.innerHTML = (adminConfig.activeAds || [])
    .map(
      (item, index) => `
        <article class="editor-card" data-index="${index}">
          <button class="remove-card" data-remove="active-ad" type="button" aria-label="Премахни">x</button>
          <h3>${escapeValue(item.title || "Активна реклама")}</h3>
          ${field("Позиция/тип", "placement", item.placement || "")}
          ${field("Заглавие", "title", item.title || "")}
          ${textarea("Описание", "description", item.description || "")}
          ${field("Линк към кампания", "url", item.url || "", "url")}
          ${hiddenField("mediaUrl", item.mediaUrl || "")}
          ${hiddenField("mediaType", item.mediaType || "")}
          ${fileField("Качи снимка или клип", "image/*,video/mp4,video/webm,video/quicktime", `activeAds.${index}.media`)}
          <div class="wide">
            <span class="upload-title">Медия за активната реклама</span>
            ${mediaPreview(item.mediaUrl || "", item.mediaType || "")}
          </div>
        </article>
      `
    )
    .join("");

  statsEditor.innerHTML = (adminConfig.stats || [])
    .map(
      (item, index) => `
        <article class="editor-card" data-index="${index}">
          <button class="remove-card" data-remove="stat" type="button" aria-label="Премахни">x</button>
          <h3>${escapeValue(item.label || "Статистика")}</h3>
          ${field("Число", "value", item.value, "number")}
          ${field("Суфикс", "suffix", item.suffix)}
          ${field("Етикет", "label", item.label)}
          ${field("Източник/статус", "source", item.source || "")}
          ${textarea("Бележка", "note", item.note)}
        </article>
      `
    )
    .join("");

  packagesEditor.innerHTML = (adminConfig.sponsorPackages || [])
    .map(
      (item, index) => `
        <article class="editor-card" data-index="${index}">
          <button class="remove-card" data-remove="package" type="button" aria-label="Премахни">x</button>
          <h3>${escapeValue(item.name || "Пакет")}</h3>
          ${field("Име на пакет", "name", item.name)}
          ${field("Цена", "price", item.price)}
          ${checkboxField("Препоръчан пакет", "recommended", item.recommended)}
          ${textarea("Какво включва? Един ред = една точка", "items", (item.items || []).join("\n"))}
        </article>
      `
    )
    .join("");
}

function syncBeforeMutating() {
  adminConfig = collectConfig();
}

function collectCards(container, mapper) {
  return [...container.querySelectorAll(".editor-card")].map((card) => mapper(card));
}

function value(card, name) {
  return card.querySelector(`[name="${name}"]`)?.value.trim() || "";
}

function lines(raw = "") {
  return raw
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatAdminDate(value = "") {
  if (!value) return "";
  return new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatFileSize(bytes = 0) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Снимката не може да бъде прочетена."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Снимката не може да бъде оптимизирана."));
    }, "image/webp", quality);
  });
}

async function optimizeImageForUpload(file, profile = imageUploadProfiles.content) {
  const supportedImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!supportedImage) {
    if (file.type.startsWith("image/") && file.size > maxUploadImageBytes) {
      throw new Error(`Този формат не може да бъде автоматично оптимизиран. Максималният размер е ${formatFileSize(maxUploadImageBytes)}.`);
    }
    return { file, optimized: false, originalSize: file.size, finalSize: file.size };
  }

  const loaded = await loadImage(file);
  const sourceWidth = loaded.image.naturalWidth;
  const sourceHeight = loaded.image.naturalHeight;

  try {
    if (!sourceWidth || !sourceHeight) throw new Error("Снимката няма валидни размери.");
    if (Math.max(sourceWidth, sourceHeight) <= profile.maxDimension && file.size <= profile.targetBytes) {
      return { file, optimized: false, originalSize: file.size, finalSize: file.size };
    }

    let dimensionLimit = Math.min(profile.maxDimension, Math.max(sourceWidth, sourceHeight));
    let quality = 0.82;
    let blob;
    let outputWidth = sourceWidth;
    let outputHeight = sourceHeight;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const scale = Math.min(1, dimensionLimit / Math.max(sourceWidth, sourceHeight));
      outputWidth = Math.max(1, Math.round(sourceWidth * scale));
      outputHeight = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Браузърът не поддържа оптимизиране на снимки.");
      context.drawImage(loaded.image, 0, 0, outputWidth, outputHeight);
      blob = await canvasToBlob(canvas, quality);
      if (blob.size <= profile.targetBytes) break;

      const proportionalScale = Math.sqrt(profile.targetBytes / blob.size) * 0.94;
      dimensionLimit = Math.max(640, Math.round(dimensionLimit * Math.min(0.9, proportionalScale)));
      quality = Math.max(0.46, quality - 0.06);
    }

    if (!blob) throw new Error("Снимката не може да бъде оптимизирана.");
    if (blob.size > profile.targetBytes) {
      throw new Error(`Снимката остава над целевите ${formatFileSize(profile.targetBytes)} след оптимизация.`);
    }
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    const optimizedFile = new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now()
    });
    return {
      file: optimizedFile,
      optimized: true,
      originalSize: file.size,
      finalSize: optimizedFile.size,
      width: outputWidth,
      height: outputHeight
    };
  } finally {
    URL.revokeObjectURL(loaded.objectUrl);
  }
}

async function uploadFile(file, target = "") {
  const optimization = await optimizeImageForUpload(file, imageUploadProfile(target));
  const formData = new FormData();
  formData.append("file", optimization.file);
  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Upload failed");
  }

  return {
    upload: await response.json(),
    optimization
  };
}

async function deleteUploadFile(filename) {
  const response = await fetch(`/api/upload?file=${encodeURIComponent(filename)}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Delete failed");
  }
}

function filenameFromUploadUrl(url = "") {
  if (!url) return "";
  try {
    const parsed = new URL(url, window.location.origin);
    const isLocalUpload = parsed.pathname.startsWith("/uploads/");
    const isSupabaseUpload = parsed.pathname.includes("/storage/v1/object/public/");
    if (!isLocalUpload && !isSupabaseUpload) return "";
    return decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return "";
  }
}

function collectManagedUploadUrls(value, urls = new Set()) {
  if (typeof value === "string") {
    if (filenameFromUploadUrl(value)) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectManagedUploadUrls(item, urls));
    return urls;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectManagedUploadUrls(item, urls));
  }
  return urls;
}

async function cleanupRemovedUploads(beforeConfig, afterConfig) {
  const beforeUrls = collectManagedUploadUrls(beforeConfig);
  const afterUrls = collectManagedUploadUrls(afterConfig);
  const failures = [];

  for (const url of beforeUrls) {
    if (afterUrls.has(url)) continue;
    try {
      await deleteLocalUploadByUrl(url);
    } catch (error) {
      failures.push(error.message);
    }
  }

  return failures;
}

async function deleteLocalUploadByUrl(url = "") {
  const filename = filenameFromUploadUrl(url);
  if (!filename) return;
  await deleteUploadFile(filename);
}

function addUploadResult(result) {
  syncBeforeMutating();
  adminConfig.mediaLibrary = adminConfig.mediaLibrary || [];
  adminConfig.mediaLibrary = adminConfig.mediaLibrary.filter((item) => item.url !== result.url && item.filename !== result.filename);
  adminConfig.mediaLibrary.unshift(result);
}

function selectMedia(target, url, type) {
  syncBeforeMutating();

  if (target === "brand.logo") adminConfig.brand.logo = url;
  if (target === "brand.heroImage") {
    adminConfig.brand.heroImage = url;
    adminConfig.brand.heroImageAlt = "hero background image";
  }

  const adMatch = target.match(/^activeAds\.(\d+)\.media$/);
  if (adMatch) {
    const index = Number(adMatch[1]);
    adminConfig.activeAds[index].mediaUrl = url;
    adminConfig.activeAds[index].mediaType = type;
  }

  const newsMatch = target.match(/^news\.(\d+)\.image$/);
  if (newsMatch) {
    const index = Number(newsMatch[1]);
    adminConfig.news[index].imageUrl = url;
  }

  const pageMatch = target.match(/^pages\.([a-zA-Z]+)\.image$/);
  if (pageMatch && adminConfig.pages?.[pageMatch[1]]) adminConfig.pages[pageMatch[1]].image = url;

  const hostMatch = target.match(/^hosts\.(\d+)\.image$/);
  if (hostMatch) adminConfig.hosts[Number(hostMatch[1])].imageUrl = url;

  const giveawayPrizeMatch = target.match(/^giveaway\.prizes\.(\d+)\.image$/);
  if (giveawayPrizeMatch && adminConfig.giveaway?.prizes?.[Number(giveawayPrizeMatch[1])]) {
    adminConfig.giveaway.prizes[Number(giveawayPrizeMatch[1])].image = url;
  }

  if (target === "sections.news.image") adminConfig.sections.news.image = url;
  if (target === "giveaway.image" && adminConfig.giveaway) adminConfig.giveaway.image = url;
}

function selectedMediaUsages(url = "") {
  const usages = [];
  if (!url) return usages;
  if (adminConfig.brand?.logo === url) usages.push("лого");
  if (adminConfig.brand?.heroImage === url) usages.push("hero background");
  (adminConfig.activeAds || []).forEach((ad, index) => {
    if (ad.mediaUrl === url) usages.push(`активна реклама ${index + 1}`);
  });
  (adminConfig.news || []).forEach((item, index) => {
    if (item.imageUrl === url) usages.push(`новина ${index + 1}`);
  });
  Object.entries(adminConfig.pages || {}).forEach(([key, page]) => {
    if (page.image === url) usages.push(`hero на ${key}`);
  });
  (adminConfig.hosts || []).forEach((host, index) => {
    if (host.imageUrl === url) usages.push(`водещ ${index + 1}`);
  });
  if (adminConfig.sections?.news?.image === url) usages.push("hero на Новини");
  if (adminConfig.giveaway?.image === url) usages.push("giveaway");
  (adminConfig.giveaway?.prizes || []).forEach((prize, index) => {
    if (prize.image === url) usages.push(`giveaway награда ${index + 1}`);
  });
  return usages;
}

function singleCard(container) {
  return container.querySelector(".editor-card");
}

function collectConfig() {
  const brandCard = singleCard(brandEditor);
  const heroCard = singleCard(heroEditor);
  const youtubeCard = singleCard(youtubeEditor);
  const sponsorPanelCard = singleCard(sponsorPanelEditor);
  const footerCard = singleCard(footerEditor);
  const giveawayCard = singleCard(giveawayEditor);
  const leagueHubSettingsCard = leagueSettingsEditor.querySelector("[data-league-hub-settings]");
  const leagueSettingsCard = leagueSettingsEditor.querySelector("[data-league-settings]");
  const giveawayMinAge = giveawayCard ? value(giveawayCard, "minAge").trim() : "";
  const giveawayPrizes = giveawayCard
    ? [...giveawayCard.querySelectorAll(".giveaway-prize-editor")].map((card, index) => ({
        id: value(card, "prizeId") || `prize-${Date.now()}-${index}`,
        name: value(card, "prizeName") || `Награда ${index + 1}`,
        quantity: Math.max(1, Math.min(20, Number(value(card, "prizeQuantity")) || 1)),
        image: value(card, "prizeImage")
      }))
    : [];
  const giveawayWinnerTotal = Math.max(1, Math.min(20, giveawayPrizes.reduce((sum, prize) => sum + prize.quantity, 0) || 1));
  const currentLeagueCollection = normalizeAdminLeagueCollection(adminConfig.predictionLeague || {});
  const selectedLeagueIndex = currentLeagueCollection.leagues.findIndex((league) => league.id === adminSelectedLeagueId);
  if (selectedLeagueIndex >= 0 && leagueSettingsCard) {
    const previousLeague = currentLeagueCollection.leagues[selectedLeagueIndex];
    currentLeagueCollection.leagues[selectedLeagueIndex] = {
      ...previousLeague,
      id: value(leagueSettingsCard, "id") || previousLeague.id,
      enabled: Boolean(leagueSettingsCard.querySelector('[name="enabled"]')?.checked),
      title: value(leagueSettingsCard, "title") || previousLeague.title,
      description: value(leagueSettingsCard, "description"),
      seasonLabel: value(leagueSettingsCard, "seasonLabel") || "D.I.S Сезон",
      trophies: collectCards(leagueTrophiesEditor, (card) => {
        const index = Number(card.dataset.index);
        return {
          id: value(card, "id") || `trophy-${Date.now()}-${index}`,
          label: value(card, "label").trim() || `Трофей ${index + 1}`,
          condition: value(card, "condition") || "exact",
          tier: value(card, "tier") || "bronze"
        };
      }),
      matches: collectCards(leagueMatchesEditor, (card) => {
        const index = Number(card.dataset.index);
        const previous = previousLeague.matches?.[index] || {};
        const resultHome = value(card, "resultHome").trim();
        const resultAway = value(card, "resultAway").trim();
        const hasResult = resultHome !== "" && resultAway !== "";
        return {
          id: value(card, "id") || `${previousLeague.id}-match-${Date.now()}-${index}`,
          enabled: Boolean(card.querySelector('[name="enabled"]')?.checked),
          competition: value(card, "competition") || previousLeague.title,
          homeTeam: value(card, "homeTeam"),
          awayTeam: value(card, "awayTeam"),
          homeTeamMedia: readTeamMediaField(card, "homeTeamMedia"),
          awayTeamMedia: readTeamMediaField(card, "awayTeamMedia"),
          kickoffAt: value(card, "kickoffAt") ? new Date(value(card, "kickoffAt")).toISOString() : "",
          isDerby: Boolean(card.querySelector('[name="isDerby"]')?.checked),
          result: hasResult ? { homeScore: Number(resultHome), awayScore: Number(resultAway) } : null,
          settledAt: hasResult ? (previous.settledAt || new Date().toISOString()) : ""
        };
      })
    };
  }
  currentLeagueCollection.enabled = Boolean(leagueHubSettingsCard?.querySelector('[name="hubEnabled"]')?.checked);
  currentLeagueCollection.title = value(leagueHubSettingsCard, "hubTitle") || "D.I.S Лиги на прогнозите";
  currentLeagueCollection.description = value(leagueHubSettingsCard, "hubDescription");

  const sections = { ...(adminConfig.sections || {}) };
  sectionEditors.flatMap((editor) => [...editor.querySelectorAll(".editor-card")]).forEach((card) => {
    const key = card.dataset.section;
    const previousSection = adminConfig.sections?.[key] || {};
    sections[key] = key === "contact"
      ? { ...previousSection, email: value(card, "email") }
      : {
          ...previousSection,
          kicker: value(card, "kicker"),
          title: value(card, "title"),
          ...(key === "news" ? { image: value(card, "image") } : {}),
          description: value(card, "description")
        };
  });

  function collectPage(editor, key) {
    const card = singleCard(editor);
    const page = {
      ...(adminConfig.pages?.[key] || {}),
      kicker: value(card, "kicker"),
      title: value(card, "title"),
      description: value(card, "description"),
      image: value(card, "image")
    };
    pageExtraFields(key).forEach(([name]) => { page[name] = value(card, name); });
    return page;
  }

  return {
    ...adminConfig,
    brand: {
      name: value(brandCard, "name"),
      logo: value(brandCard, "logo"),
      heroImage: value(brandCard, "heroImage"),
      heroImageAlt: "hero background image"
    },
    nav: collectCards(navEditor, (card) => ({
      label: value(card, "label"),
      href: value(card, "href")
    })),
    hero: {
      eyebrow: value(heroCard, "eyebrow"),
      title: value(heroCard, "title"),
      copy: value(heroCard, "copy"),
      primaryLabel: value(heroCard, "primaryLabel"),
      primaryUrl: value(heroCard, "primaryUrl"),
      secondaryLabel: value(heroCard, "secondaryLabel"),
      secondaryUrl: value(heroCard, "secondaryUrl"),
      chips: lines(value(heroCard, "chips"))
    },
    sections,
    pages: {
      fanZone: collectPage(fanPageEditor, "fanZone"),
      hosts: collectPage(hostsPageEditor, "hosts"),
      partners: collectPage(partnersPageEditor, "partners"),
      contact: collectPage(contactPageEditor, "contact")
    },
    footer: {
      description: value(footerCard, "description"),
      email: value(footerCard, "email"),
      links: collectCards(footerLinksEditor, (card) => ({ label: value(card, "label"), href: value(card, "href") })),
      socials: collectCards(footerSocialsEditor, (card) => ({ name: value(card, "name"), url: value(card, "url") }))
    },
    ticker: lines(tickerInput.value),
    socials: collectCards(socialsEditor, (card) => ({
      name: value(card, "name"),
      handle: value(card, "handle"),
      url: value(card, "url"),
      icon: value(card, "icon"),
      label: value(card, "label")
    })),
    youtubePlayer: {
      title: value(youtubeCard, "title"),
      url: value(youtubeCard, "url"),
      description: value(youtubeCard, "description")
    },
    news: collectCards(newsEditor, (card) => {
      const index = Number(card.dataset.index);
      return {
        slug: value(card, "slug") || adminNewsSlug(adminConfig.news?.[index] || {}, index),
        title: value(card, "title"),
        excerpt: compactNewsExcerpt(value(card, "excerpt"), 320),
        body: value(card, "body"),
        imageCaption: value(card, "imageCaption"),
        imageUrl: value(card, "imageUrl"),
        createdAt: adminConfig.news?.[index]?.createdAt || new Date().toISOString()
      };
    }),
    formats: collectCards(formatsEditor, (card) => ({
      number: value(card, "number"),
      title: value(card, "title"),
      description: value(card, "description"),
      items: lines(value(card, "items"))
    })),
    hosts: collectCards(hostsEditor, (card) => ({
      name: value(card, "name"),
      role: value(card, "role"),
      bio: value(card, "bio"),
      favoriteTeam: value(card, "favoriteTeam"),
      favoritePlayer: value(card, "favoritePlayer"),
      footballMemory: value(card, "footballMemory"),
      matchStyle: value(card, "matchStyle"),
      imageUrl: value(card, "imageUrl")
    })),
    predictions: collectCards(predictionsEditor, (card) => {
      const index = Number(card.dataset.index);
      return {
        id: value(card, "id") || `prediction-${Date.now()}-${index}`,
        host: value(card, "host"),
        match: value(card, "match"),
        prediction: value(card, "prediction"),
        analysis: value(card, "analysis"),
        createdAt: adminConfig.predictions?.[index]?.createdAt || new Date().toISOString()
      };
    }),
    polls: collectCards(pollsEditor, (card) => {
      const index = Number(card.dataset.index);
      return {
        id: value(card, "id") || `poll-${Date.now()}-${index}`,
        title: value(card, "title"),
        match: value(card, "match"),
        question: value(card, "question"),
        status: value(card, "status") || "active",
        resultsVisible: Boolean(card.querySelector('[name="resultsVisible"]')?.checked),
        closesAt: value(card, "closesAt") ? new Date(value(card, "closesAt")).toISOString() : "",
        options: [...card.querySelectorAll(".admin-poll-option")].map((optionCard, optionIndex) => ({
          id: value(optionCard, "optionId") || `option-${Date.now()}-${optionIndex}`,
          label: value(optionCard, "optionLabel"),
          media: readTeamMediaField(optionCard, "optionMedia")
        })).filter((option) => option.label)
      };
    }),
    predictionLeague: currentLeagueCollection,
    giveaway: giveawayCard ? {
      id: value(giveawayCard, "id") || `giveaway-${Date.now()}`,
      enabled: Boolean(giveawayCard.querySelector('[name="enabled"]')?.checked),
      title: value(giveawayCard, "title"),
      prize: giveawayPrizes.map((prize) => prize.name).join(", ") || "Футболна награда",
      prizes: giveawayPrizes.length ? giveawayPrizes : normalizeGiveawayPrizes(adminConfig.giveaway),
      description: value(giveawayCard, "description"),
      image: value(giveawayCard, "image") || "./assets/giveaway-football.webp",
      startsAt: value(giveawayCard, "startsAt") ? new Date(value(giveawayCard, "startsAt")).toISOString() : "",
      endsAt: value(giveawayCard, "endsAt") ? new Date(value(giveawayCard, "endsAt")).toISOString() : "",
      winnerCount: giveawayWinnerTotal,
      minAge: giveawayMinAge === "" ? null : Math.max(0, Math.min(99, Number(giveawayMinAge) || 0)),
      region: value(giveawayCard, "region"),
      socialHandleRequired: Boolean(giveawayCard.querySelector('[name="socialHandleRequired"]')?.checked),
      requirements: lines(value(giveawayCard, "requirements")),
      officialRules: value(giveawayCard, "officialRules"),
      privacyNotice: value(giveawayCard, "privacyNotice"),
      platformNotice: value(giveawayCard, "platformNotice")
    } : null,
    sponsorPanel: {
      label: value(sponsorPanelCard, "label"),
      title: value(sponsorPanelCard, "title"),
      description: value(sponsorPanelCard, "description"),
      image: value(sponsorPanelCard, "image") || "./assets/partner-placement-football-media.webp"
    },
    mediaLibrary: adminConfig.mediaLibrary || [],
    adSlots: collectCards(adsEditor, (card) => ({
      format: value(card, "format"),
      title: value(card, "title"),
      description: value(card, "description")
    })),
    activeAds: collectCards(activeAdsEditor, (card) => ({
      placement: value(card, "placement"),
      title: value(card, "title"),
      description: value(card, "description"),
      url: value(card, "url"),
      mediaUrl: value(card, "mediaUrl"),
      mediaType: value(card, "mediaType")
    })),
    stats: collectCards(statsEditor, (card) => ({
      value: Number(value(card, "value")),
      suffix: value(card, "suffix"),
      label: value(card, "label"),
      note: value(card, "note"),
      source: value(card, "source")
    })),
    sponsorPackages: collectSponsorPackages()
  };
}

function collectSponsorPackages() {
  let recommendedUsed = false;
  return collectCards(packagesEditor, (card) => {
    const isRecommended = !recommendedUsed && Boolean(card.querySelector('[name="recommended"]')?.checked);
    if (isRecommended) recommendedUsed = true;
    return {
      name: value(card, "name"),
      price: value(card, "price"),
      recommended: isRecommended,
      items: lines(value(card, "items"))
    };
  });
}

document.querySelector("#admin-form").addEventListener("submit", (event) => event.preventDefault());

function applyPage(target, page, snapshot) {
  const source = withDefaults(structuredClone(snapshot));
  if (page === "global") {
    target.brand = source.brand;
    target.nav = source.nav;
    target.socials = source.socials;
    target.mediaLibrary = source.mediaLibrary;
  }
  if (page === "home") {
    target.hero = source.hero;
    ["socials", "latest", "formats", "discovery", "homeContact"].forEach((key) => { target.sections[key] = source.sections[key]; });
    target.ticker = source.ticker;
    target.youtubePlayer = source.youtubePlayer;
    target.formats = source.formats;
  }
  if (page === "news") {
    target.sections.news = source.sections.news;
    target.news = source.news;
  }
  if (page === "fan") {
    target.pages.fanZone = source.pages.fanZone;
    target.predictionLeague = source.predictionLeague;
    target.predictions = source.predictions;
    target.polls = source.polls;
    target.giveaway = source.giveaway;
  }
  if (page === "hosts") {
    target.pages.hosts = source.pages.hosts;
    target.hosts = source.hosts;
  }
  if (page === "partners") {
    target.pages.partners = source.pages.partners;
    ["sponsors", "activeAds", "mediaKit"].forEach((key) => { target.sections[key] = source.sections[key]; });
    target.sponsorPanel = source.sponsorPanel;
    target.adSlots = source.adSlots;
    target.activeAds = source.activeAds;
    target.stats = source.stats;
    target.sponsorPackages = source.sponsorPackages;
  }
  if (page === "contact") {
    target.pages.contact = source.pages.contact;
    target.sections.contact = source.sections.contact;
    target.footer = source.footer;
  }
}

document.querySelectorAll("[data-save-page]").forEach((button) => {
  button.addEventListener("click", async () => {
    const page = button.dataset.savePage;
    const draftConfig = collectConfig();
    if (page === "fan") {
      const incompleteResult = [...leagueMatchesEditor.querySelectorAll(".editor-card")].some((card) => {
        const home = value(card, "resultHome").trim();
        const away = value(card, "resultAway").trim();
        return (home === "") !== (away === "");
      });
      if (incompleteResult) {
        await showInfo("За краен резултат въведи и двата резултата или остави и двете полета празни.");
        return;
      }
      const invalidLeagueMatch = (draftConfig.predictionLeague?.leagues || []).flatMap((league) => league.matches || []).find((match) =>
        !match.homeTeam || !match.awayTeam ||
        (match.result && (!Number.isInteger(match.result.homeScore) || !Number.isInteger(match.result.awayScore) || match.result.homeScore < 0 || match.result.awayScore < 0 || match.result.homeScore > 30 || match.result.awayScore > 30))
      );
      if (invalidLeagueMatch) {
        await showInfo("Всеки мач от Лигата на прогнозите трябва да има два отбора и валиден резултат между 0 и 30.");
        return;
      }
    }
    const configuredWinnerCount = (draftConfig.giveaway?.prizes || []).reduce((sum, prize) => sum + (Number(prize.quantity) || 0), 0);
    if (page === "fan" && draftConfig.giveaway && configuredWinnerCount > 20) {
      await showInfo("Общият брой награди и победители може да бъде най-много 20. Намали количеството на някоя награда.");
      return;
    }
    if (!(await askConfirmation(`Сигурен ли си, че искаш да запазиш „${button.textContent.replace("Запази", "").trim()}“?`))) return;
    const lastSavedConfig = structuredClone(savedConfig);
    const nextConfig = withDefaults(structuredClone(savedConfig));
    applyPage(nextConfig, page, draftConfig);
    try {
      const response = await fetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Сървърът не успя да запази промените.");
      }
      savedConfig = withDefaults(await response.json());
      applyPage(adminConfig, page, savedConfig);
      const cleanupFailures = await cleanupRemovedUploads(lastSavedConfig, savedConfig);
      setStatus(cleanupFailures.length ? "Промените са запазени, но някои стари файлове не бяха изтрити." : "Промените са запазени.", cleanupFailures.length > 0);
    } catch (error) {
      adminConfig = withDefaults(structuredClone(draftConfig));
      setStatus(`Промените не са запазени: ${error.message}`, true);
    }
  });
});

document.querySelectorAll("[data-revert-page]").forEach((button) => {
  button.addEventListener("click", async () => {
    const page = button.dataset.revertPage;
    if (!(await askConfirmation("Да върна ли последно запазената версия на този раздел? Всички незапазени промени тук ще бъдат отменени."))) return;
    const draftConfig = collectConfig();
    adminConfig = withDefaults(structuredClone(draftConfig));
    applyPage(adminConfig, page, savedConfig);
    renderEditors();
    const cleanupFailures = await cleanupRemovedUploads(draftConfig, adminConfig);
    setStatus(cleanupFailures.length ? "Последно запазената версия е върната, но някои незапазени файлове не бяха изтрити." : "Последно запазената версия е върната.", cleanupFailures.length > 0);
  });
});

document.querySelectorAll("[data-admin-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    adminConfig = collectConfig();
    const page = button.dataset.adminTab;
    document.querySelectorAll("[data-admin-tab]").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    document.querySelectorAll("[data-admin-page]").forEach((panel) => {
      const active = panel.dataset.adminPage === page;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    if (page === "inbox") loadMessages();
    window.scrollTo({ top: document.querySelector(".admin-page-tabs").offsetTop - 16, behavior: "smooth" });
  });
});

document.querySelectorAll("[data-add]").forEach((button) => {
  button.addEventListener("click", () => {
    syncBeforeMutating();
    const type = button.dataset.add;
    if (type === "social") {
      adminConfig.socials.push({ name: "Нов канал", handle: "@handle", url: "https://", icon: "NW", label: "Кратко описание" });
    }
    if (type === "format") {
      adminConfig.formats.push({ number: "05", title: "Нов формат", description: "Описание на формата", items: ["Ключов акцент"] });
    }
    if (type === "news") {
      const createdAt = new Date().toISOString();
      adminConfig.news.unshift({
        slug: `nova-novina-${createdAt.replace(/\D/g, "").slice(0, 12)}`,
        title: "Нова новина",
        excerpt: "Кратко резюме за картата и споделянето.",
        body: "Пълен текст на новината.",
        imageCaption: "",
        imageUrl: "",
        createdAt
      });
    }
    if (type === "ad") {
      adminConfig.adSlots.push({ format: "Нов формат", title: "Заглавие", description: "Описание" });
    }
    if (type === "active-ad") {
      adminConfig.activeAds.push({ placement: "Website", title: "Нова активна реклама", description: "Описание", url: "", mediaUrl: "", mediaType: "" });
    }
    if (type === "stat") {
      adminConfig.stats.push({ value: 0, suffix: "+", label: "нова статистика", note: "Бележка", source: "Ръчно въведено" });
    }
    if (type === "package") {
      adminConfig.sponsorPackages.push({ name: "Нов пакет", price: "по договаряне", recommended: false, items: ["Какво включва"] });
    }
    if (type === "prediction") {
      adminConfig.predictions.unshift({ id: `prediction-${Date.now()}`, host: "Водещ", match: "Предстоящ мач", prediction: "Прогноза", analysis: "Коментар към прогнозата", createdAt: new Date().toISOString() });
    }
    if (type === "poll") {
      adminConfig.polls.unshift({ id: `poll-${Date.now()}`, title: "Фенски вот", match: "Отбор A срещу Отбор B", question: "Кой ще спечели?", status: "active", resultsVisible: true, closesAt: "", options: [{ id: `option-${Date.now()}-0`, label: "Отбор A" }, { id: `option-${Date.now()}-1`, label: "Равенство" }, { id: `option-${Date.now()}-2`, label: "Отбор B" }] });
    }
    if (type === "league") {
      adminConfig.predictionLeague = normalizeAdminLeagueCollection(adminConfig.predictionLeague || {});
      if (adminConfig.predictionLeague.leagues.length >= 24) {
        setStatus("Можеш да добавиш най-много 24 лиги.", true);
        return;
      }
      const id = `league-${Date.now()}`;
      adminConfig.predictionLeague.leagues.push({
        id,
        enabled: true,
        title: "Нова лига",
        description: "Прогнозирай резултата и се изкачи в отделната класация.",
        seasonLabel: "D.I.S Сезон 2026/27",
        trophies: structuredClone(adminConfig.predictionLeague.leagues[0]?.trophies || []),
        matches: []
      });
      adminSelectedLeagueId = id;
    }
    if (type === "league-match") {
      adminConfig.predictionLeague = normalizeAdminLeagueCollection(adminConfig.predictionLeague || {});
      const selectedLeague = adminConfig.predictionLeague.leagues.find((league) => league.id === adminSelectedLeagueId);
      if (!selectedLeague) {
        setStatus("Първо добави и избери лига.", true);
        return;
      }
      selectedLeague.matches ||= [];
      selectedLeague.matches.push({
        id: `${selectedLeague.id}-match-${Date.now()}`,
        enabled: true,
        competition: selectedLeague.title,
        homeTeam: "Отбор A",
        awayTeam: "Отбор B",
        homeTeamMedia: null,
        awayTeamMedia: null,
        kickoffAt: "",
        isDerby: false,
        result: null,
        settledAt: ""
      });
    }
    if (type === "league-trophy") {
      adminConfig.predictionLeague = normalizeAdminLeagueCollection(adminConfig.predictionLeague || {});
      const selectedLeague = adminConfig.predictionLeague.leagues.find((league) => league.id === adminSelectedLeagueId);
      if (!selectedLeague) {
        setStatus("Първо добави и избери лига.", true);
        return;
      }
      selectedLeague.trophies ||= [];
      if (selectedLeague.trophies.length >= 20) {
        setStatus("Можеш да добавиш най-много 20 трофея.");
        return;
      }
      selectedLeague.trophies.push({
        id: `${selectedLeague.id}-trophy-${Date.now()}`,
        label: "Нов трофей",
        condition: "exact",
        tier: "bronze"
      });
    }
    if (type === "giveaway" && !adminConfig.giveaway) {
      adminConfig.giveaway = createGiveawayDraft();
    }
    if (type === "host") {
      adminConfig.hosts.push({ name: "Нов водещ", role: "Водещ", bio: "Кратко представяне", imageUrl: "", favoriteTeam: "", favoritePlayer: "", footballMemory: "", matchStyle: "" });
    }
    if (type === "footer-link") {
      adminConfig.footer.links.push({ label: "Нов линк", href: "/" });
    }
    if (type === "footer-social") {
      adminConfig.footer.socials.push({ name: "Нова мрежа", url: "https://" });
    }
    renderEditors();
  });
});

document.addEventListener("click", async (event) => {
  const teamMediaResultButton = event.target.closest("[data-team-media-result]");
  if (teamMediaResultButton) {
    const picker = teamMediaResultButton.closest("[data-team-media-picker]");
    const result = teamMediaSearchResults.get(picker)?.[Number(teamMediaResultButton.dataset.teamMediaResult)];
    if (result) {
      updateTeamMediaPicker(picker, result);
      const results = picker.querySelector("[data-team-media-results]");
      if (results) results.hidden = true;
      setStatus(`Избрано е логото на ${result.name}. Запази страницата, за да кешираш избора.`);
    }
    return;
  }

  const teamMediaSearchButton = event.target.closest("[data-team-media-search]");
  if (teamMediaSearchButton) {
    const picker = teamMediaSearchButton.closest("[data-team-media-picker]");
    const scope = picker.closest(".admin-poll-option") || picker.closest(".editor-card");
    const query = scope?.querySelector(`[name="${picker.dataset.nameField}"]`)?.value.trim() || "";
    if (query.length < 3) {
      showTeamMediaResults(picker, [], "Въведи поне 3 символа в името на отбора или държавата.");
      return;
    }
    teamMediaSearchButton.disabled = true;
    teamMediaSearchButton.textContent = "Търсене…";
    try {
      const response = await fetch(`/api/team-media/search?q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Търсенето не успя.");
      showTeamMediaResults(picker, payload.results || []);
    } catch (error) {
      showTeamMediaResults(picker, [], error.message);
    } finally {
      teamMediaSearchButton.disabled = false;
      teamMediaSearchButton.textContent = "Намери лого / флаг";
    }
    return;
  }

  const teamMediaClearButton = event.target.closest("[data-team-media-clear]");
  if (teamMediaClearButton) {
    updateTeamMediaPicker(teamMediaClearButton.closest("[data-team-media-picker]"), null);
    setStatus("Автоматичното лого е премахнато от черновата.");
    return;
  }

  const addPollOptionButton = event.target.closest("[data-add-poll-option]");
  if (addPollOptionButton) {
    syncBeforeMutating();
    const pollIndex = Number(addPollOptionButton.closest(".editor-card")?.dataset.index);
    const poll = adminConfig.polls?.[pollIndex];
    if (poll) {
      poll.options ||= [];
      poll.options.push({ id: `option-${Date.now()}-${poll.options.length}`, label: "Нова опция", media: null });
      renderEditors();
    }
    return;
  }

  const removePollOptionButton = event.target.closest("[data-remove-poll-option]");
  if (removePollOptionButton) {
    const pollCard = removePollOptionButton.closest(".editor-card");
    if (pollCard?.querySelectorAll(".admin-poll-option").length <= 2) {
      await showInfo("Гласуването трябва да има поне две опции.");
      return;
    }
    syncBeforeMutating();
    const pollIndex = Number(pollCard.dataset.index);
    const optionIndex = Number(removePollOptionButton.closest(".admin-poll-option")?.dataset.pollOptionIndex);
    adminConfig.polls?.[pollIndex]?.options?.splice(optionIndex, 1);
    renderEditors();
    return;
  }

  const copyLinkButton = event.target.closest("[data-copy-link]");
  if (copyLinkButton) {
    try {
      await navigator.clipboard.writeText(copyLinkButton.dataset.copyLink || "");
      const originalLabel = copyLinkButton.textContent;
      copyLinkButton.textContent = "Копирано";
      window.setTimeout(() => { copyLinkButton.textContent = originalLabel; }, 1600);
    } catch {
      await showInfo("Линкът не може да бъде копиран автоматично. Маркирай го и го копирай ръчно.");
    }
    return;
  }

  const leagueSelectButton = event.target.closest("[data-admin-league-select]");
  if (leagueSelectButton) {
    adminConfig = collectConfig();
    adminSelectedLeagueId = leagueSelectButton.dataset.adminLeagueSelect;
    renderEditors();
    return;
  }

  const addGiveawayPrizeButton = event.target.closest("[data-add-giveaway-prize]");
  if (addGiveawayPrizeButton) {
    syncBeforeMutating();
    adminConfig.giveaway.prizes ||= [];
    adminConfig.giveaway.prizes.push({ id: `prize-${Date.now()}`, name: "Нова награда", quantity: 1, image: "" });
    renderEditors();
    return;
  }

  const removeGiveawayPrizeButton = event.target.closest("[data-remove-giveaway-prize]");
  if (removeGiveawayPrizeButton) {
    syncBeforeMutating();
    if ((adminConfig.giveaway?.prizes || []).length <= 1) {
      await showInfo("Giveaway трябва да има поне една награда.");
      return;
    }
    if (!(await askConfirmation("Да премахна ли тази награда? Промяната ще се публикува след Запази Фен зона."))) return;
    const index = Number(removeGiveawayPrizeButton.closest("[data-prize-index]")?.dataset.prizeIndex);
    adminConfig.giveaway.prizes.splice(index, 1);
    renderEditors();
    return;
  }

  const removeGiveawayPrizeImageButton = event.target.closest("[data-remove-giveaway-prize-image]");
  if (removeGiveawayPrizeImageButton) {
    if (!(await askConfirmation("Да премахна ли снимката на тази награда?"))) return;
    syncBeforeMutating();
    const index = Number(removeGiveawayPrizeImageButton.closest("[data-prize-index]")?.dataset.prizeIndex);
    if (adminConfig.giveaway?.prizes?.[index]) adminConfig.giveaway.prizes[index].image = "";
    renderEditors();
    return;
  }

  const removeHostImageButton = event.target.closest("[data-remove-host-image]");
  if (removeHostImageButton) {
    if (!(await askConfirmation("Сигурен ли си, че искаш да изтриеш снимката на този водещ?"))) return;
    syncBeforeMutating();
    const index = Number(removeHostImageButton.dataset.removeHostImage);
    if (adminConfig.hosts?.[index]) adminConfig.hosts[index].imageUrl = "";
    renderEditors();
    return;
  }

  const deleteMediaButton = event.target.closest("[data-delete-media]");
  if (deleteMediaButton) {
    const filename = deleteMediaButton.dataset.deleteMedia;
    const media = (adminConfig.mediaLibrary || []).find((item) => item.filename === filename);
    const usages = selectedMediaUsages(media?.url);
    if (usages.length) {
      await showInfo(`Тази снимка не може да се изтрие, защото е избрана като: ${usages.join(", ")}. Първо избери друга снимка за това място.`);
      return;
    }

    if (!(await askConfirmation("Сигурен ли си, че искаш да изтриеш тази медия?"))) return;

    syncBeforeMutating();
    adminConfig.mediaLibrary = (adminConfig.mediaLibrary || []).filter((item) => item.filename !== filename);
    renderEditors();
    setStatus("Медията е изтрита. Натисни Запази промените, за да публикуваш промяната.");
    return;
  }

  const brandMediaButton = event.target.closest("[data-select-brand-media]");
  if (brandMediaButton) {
    const choice = await askConfirmation("Къде искаш да използваш тази снимка?", {
      okLabel: "Като лого",
      altLabel: "Като background"
    });
    if (!choice) return;
    const target = choice === "alt" ? "brand.heroImage" : "brand.logo";
    selectMedia(target, brandMediaButton.dataset.selectBrandMedia, brandMediaButton.dataset.mediaType);
    renderEditors();
    setStatus("Снимката е избрана. Натисни Запази промените, за да я публикуваш.");
    return;
  }

  const selectButton = event.target.closest("[data-select-media]");
  if (selectButton) {
    selectMedia(selectButton.dataset.selectMedia, selectButton.dataset.mediaUrl, selectButton.dataset.mediaType);
    renderEditors();
    setStatus("Медията е избрана. Натисни Запази промените, за да я публикуваш.");
    return;
  }

  const removeButton = event.target.closest("[data-remove]");
  if (!removeButton) return;
  const type = removeButton.dataset.remove;
  const removalQuestion = type === "league-match"
    ? "Да премахна ли този мач от админ панела? Ако има въведен краен резултат, спечелените точки и статистиката ще се запазят."
    : type === "league"
      ? "Да премахна ли тази лига от админ панела? Завършените мачове и вече спечелените точки ще останат архивирани, но лигата ще бъде скрита."
      : `Сигурен ли си, че искаш да премахнеш ${removalLabel(type)}?`;
  if (!(await askConfirmation(removalQuestion))) return;

  syncBeforeMutating();
  const card = removeButton.closest(".editor-card, .admin-league-card");
  const index = Number(card.dataset.index);
  if (type === "nav") adminConfig.nav.splice(index, 1);
  if (type === "social") adminConfig.socials.splice(index, 1);
  if (type === "format") adminConfig.formats.splice(index, 1);
  if (type === "news") {
    adminConfig.news.splice(index, 1);
  }
  if (type === "ad") adminConfig.adSlots.splice(index, 1);
  if (type === "active-ad") {
    adminConfig.activeAds.splice(index, 1);
  }
  if (type === "stat") adminConfig.stats.splice(index, 1);
  if (type === "package") adminConfig.sponsorPackages.splice(index, 1);
  if (type === "prediction") adminConfig.predictions.splice(index, 1);
  if (type === "poll") adminConfig.polls.splice(index, 1);
  if (type === "league") {
    adminConfig.predictionLeague.leagues.splice(index, 1);
    adminSelectedLeagueId = adminConfig.predictionLeague.leagues[Math.min(index, adminConfig.predictionLeague.leagues.length - 1)]?.id || "";
  }
  const selectedLeague = adminConfig.predictionLeague?.leagues?.find((league) => league.id === adminSelectedLeagueId);
  if (type === "league-match") selectedLeague?.matches.splice(index, 1);
  if (type === "league-trophy") selectedLeague?.trophies.splice(index, 1);
  if (type === "giveaway") adminConfig.giveaway = null;
  if (type === "footer-link") adminConfig.footer.links.splice(index, 1);
  if (type === "footer-social") adminConfig.footer.socials.splice(index, 1);
  if (type === "host") {
    adminConfig.hosts.splice(index, 1);
  }
  renderEditors();
});

document.addEventListener("change", (event) => {
  const trophyCard = event.target.closest(".league-trophy-editor");
  if (trophyCard) updateLeagueTrophyCard(trophyCard);
  const recommendedInput = event.target.closest('[name="recommended"]');
  if (!recommendedInput || !recommendedInput.checked) return;
  packagesEditor.querySelectorAll('[name="recommended"]').forEach((input) => {
    if (input !== recommendedInput) input.checked = false;
  });
});

document.addEventListener("input", (event) => {
  const trophyCard = event.target.closest(".league-trophy-editor");
  if (trophyCard) updateLeagueTrophyCard(trophyCard);
});

confirmOk.addEventListener("click", () => closeConfirmation(true));
confirmAlt.addEventListener("click", () => closeConfirmation("alt"));
confirmCancelControls.forEach((control) => {
  control.addEventListener("click", () => closeConfirmation(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.hidden) closeConfirmation(false);
  if (event.key === "Escape" && winnerModal && !winnerModal.hidden) closeWinnerCelebration();
  if (
    (event.key === "Enter" || event.key === " ") &&
    event.target.closest(".media-library-card") &&
    !event.target.closest("[data-delete-media]")
  ) {
    event.preventDefault();
    event.target.closest(".media-library-card").click();
  }
});

document.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-upload]");
  if (!input || !input.files?.[0]) return;

  const file = input.files[0];
  const target = input.dataset.uploadTarget || "";
  const loadingMessage = file.type.startsWith("image/")
    ? `Оптимизиране и качване на ${file.name}...`
    : `Качване на ${file.name}...`;
  setUploadState(input, "loading", loadingMessage);
  setStatus(`Оптимизиране и качване на ${file.name}...`);

  try {
    await nextPaint();
    syncBeforeMutating();
    const { upload: result, optimization } = await uploadFile(file, target);
    if (target) {
      selectMedia(target, result.url, result.type);
    } else {
      addUploadResult(result);
    }
    renderEditors();
    const optimizationText = optimization.optimized
      ? ` Оптимизирана: ${formatFileSize(optimization.originalSize)} → ${formatFileSize(optimization.finalSize)} (${optimization.width}×${optimization.height}).`
      : "";
    const successMessage = `${target ? "Файлът е качен и избран. Натисни Запази промените." : "Файлът е добавен в историята за лого/background."}${optimizationText}`;
    setUploadState(findUploadInput(target), "success", successMessage);
    setStatus(successMessage);
  } catch (error) {
    const errorMessage = `Качването не успя: ${error.message}`;
    input.value = "";
    setUploadState(input, "error", errorMessage);
    setStatus(errorMessage, true);
  }
});

async function loadMessages() {
  if (!messagesEditor) return;
  try {
    const response = await fetch("/api/messages", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Inbox load failed");
    const messages = await response.json();
    const unread = messages.filter((message) => message.status === "new").length;
    inboxCount.textContent = unread ? String(unread) : "";
    messagesEditor.innerHTML = messages.length
      ? messages.map((message) => `
          <article class="editor-card message-card status-${escapeValue(message.status)}" data-message-id="${escapeValue(message.id)}">
            <button class="remove-card" data-delete-message type="button" aria-label="Изтрий">x</button>
            <div class="message-card-top"><span>${escapeValue(messageTypeLabel(message.type))}</span><time>${escapeValue(formatAdminDate(message.createdAt))}</time></div>
            <h3>${escapeValue(message.subject || message.name)}</h3>
            <p><strong>${escapeValue(message.name)}</strong>${message.email ? ` · <a href="mailto:${escapeValue(message.email)}">${escapeValue(message.email)}</a>` : ""}</p>
            ${message.company ? `<p>Компания: ${escapeValue(message.company)}${message.budget ? ` · Бюджет: ${escapeValue(message.budget)}` : ""}</p>` : ""}
            <div class="message-body">${escapeValue(message.message).replaceAll("\n", "<br>")}</div>
            ${inboxStatusField(message.status)}
          </article>`).join("")
      : `<article class="empty-state">Няма входящи съобщения.</article>`;
  } catch {
    messagesEditor.innerHTML = `<article class="empty-state">Inbox-ът не може да се зареди.</article>`;
  }
}

function renderGiveawayEntryCards() {
  if (!giveawayEntriesEditor) return;
  const query = giveawayEntrySearchTerm.trim().toLocaleLowerCase("bg-BG");
  let entries = query
    ? giveawayEntriesCache.filter((entry) => [entry.name, entry.email, entry.socialHandle, entry.prizeName].some((value) => String(value || "").toLocaleLowerCase("bg-BG").includes(query)))
    : giveawayEntriesCache;
  if (giveawayEntryFilters.winnersOnly) entries = entries.filter((entry) => Boolean(entry.winnerRank));
  if (giveawayEntryFilters.ineligibleOnly) entries = entries.filter((entry) => entry.eligible === false);
  if (!giveawayEntriesCache.length) {
    giveawayEntriesEditor.innerHTML = `<article class="empty-state">Все още няма записани участници.</article>`;
    return;
  }
  if (!entries.length) {
    giveawayEntriesEditor.innerHTML = `<article class="empty-state">Няма участник, който отговаря на избраните филтри.</article>`;
    return;
  }
  giveawayEntriesEditor.innerHTML = entries.map((entry) => `
    <article class="editor-card giveaway-entry-card ${entry.winnerRank ? "is-winner" : ""} ${entry.eligible === false ? "is-ineligible" : ""}" data-giveaway-entry-id="${escapeValue(entry.id)}">
      ${entry.winnerRank ? "" : `<button class="remove-card" data-delete-giveaway-entry type="button" aria-label="Изтрий участник">x</button>`}
      <div class="message-card-top"><span>${entry.winnerRank ? `Победител #${entry.winnerRank}` : entry.eligible === false ? "Изключен" : "Допуснат"}</span><time>${escapeValue(formatAdminDate(entry.createdAt))}</time></div>
      <h3>${escapeValue(entry.name)}</h3>
      <p><a href="mailto:${escapeValue(entry.email)}">${escapeValue(entry.email)}</a>${entry.socialHandle ? ` · ${escapeValue(entry.socialHandle)}` : ""}</p>
      ${entry.drawnAt ? `<p>Изтеглен: ${escapeValue(formatAdminDate(entry.drawnAt))}</p>` : ""}
      ${entry.prizeName ? `<p class="giveaway-entry-prize"><span>Награда</span><strong>${escapeValue(entry.prizeName)}</strong></p>` : ""}
      ${entry.winnerRank
        ? `<div class="giveaway-winner-status"><i></i><span>Изтеглен победител</span></div>`
        : `<button class="button secondary" data-toggle-giveaway-entry type="button">${entry.eligible === false ? "Допусни до теглене" : "Изключи от теглене"}</button>`}
    </article>`).join("");
}

async function loadGiveawayEntries() {
  if (!giveawayEntriesEditor || !giveawayAdminToolbar) return;
  const giveaway = adminConfig.giveaway;
  if (!giveaway?.id) {
    giveawayEntriesCache = [];
    giveawayAdminToolbar.innerHTML = "";
    giveawayEntriesEditor.innerHTML = `<article class="empty-state">Създай и запази giveaway, за да започнеш да събираш участници.</article>`;
    return;
  }

  giveawayEntriesEditor.innerHTML = `<article class="empty-state">Зареждане на участниците...</article>`;
  try {
    const response = await fetch(`/api/giveaway/entries?giveawayId=${encodeURIComponent(giveaway.id)}`, { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Участниците не могат да бъдат заредени.");
    const entries = payload.entries || [];
    giveawayEntriesCache = entries;
    const winners = entries.filter((entry) => entry.winnerRank);
    const eligible = entries.filter((entry) => entry.eligible !== false).length;
    const registrationOpen = giveawayRegistrationIsOpen(giveaway);
    const winnerCount = giveawayWinnerCount(giveaway);
    giveawayAdminToolbar.innerHTML = `
      <div><strong>${entries.length}</strong><span>участници</span></div>
      <div><strong>${eligible}</strong><span>допуснати</span></div>
      <p class="giveaway-admin-state ${registrationOpen ? "is-open" : ""}">${registrationOpen ? "Записването е отворено. За теглене го спри и запази Фен зона." : "Записването е спряно. Може да подготвиш тегленето."}</p>
      <label class="giveaway-entry-search"><span>Търси участник</span><input data-giveaway-entry-search type="search" value="${escapeValue(giveawayEntrySearchTerm)}" placeholder="Име, имейл или профил" /></label>
      <fieldset class="giveaway-entry-filters">
        <legend>Филтри</legend>
        <label><input data-giveaway-entry-filter="winnersOnly" type="checkbox" ${giveawayEntryFilters.winnersOnly ? "checked" : ""} /><span>Само победители</span></label>
        <label><input data-giveaway-entry-filter="ineligibleOnly" type="checkbox" ${giveawayEntryFilters.ineligibleOnly ? "checked" : ""} /><span>Само недопуснати</span></label>
      </fieldset>
      <button class="button primary" data-draw-giveaway type="button" ${eligible < winnerCount || winners.length ? "disabled" : ""}>Изтегли ${winnerCount} победител${winnerCount === 1 ? "" : "и"}</button>
      <button class="button secondary" data-export-giveaway-entries type="button" ${entries.length ? "" : "disabled"}>Изтегли CSV</button>
      <button class="button secondary" data-reset-giveaway-winners type="button" ${winners.length ? "" : "disabled"}>Нулирай резултата</button>
      <button class="button secondary" data-clear-giveaway-entries type="button" ${entries.length ? "" : "disabled"}>Изтрий всички</button>`;
    renderGiveawayEntryCards();
  } catch (error) {
    giveawayEntriesCache = [];
    giveawayAdminToolbar.innerHTML = "";
    giveawayEntriesEditor.innerHTML = `<article class="empty-state">${escapeValue(error.message)}</article>`;
  }
}

document.querySelector("#refresh-giveaway-entries")?.addEventListener("click", loadGiveawayEntries);

document.addEventListener("input", (event) => {
  const search = event.target.closest("[data-giveaway-entry-search]");
  if (!search) return;
  giveawayEntrySearchTerm = search.value;
  renderGiveawayEntryCards();
});

document.addEventListener("change", (event) => {
  const filter = event.target.closest("[data-giveaway-entry-filter]");
  if (!filter) return;
  giveawayEntryFilters[filter.dataset.giveawayEntryFilter] = filter.checked;
  renderGiveawayEntryCards();
});

function giveawayRegistrationIsOpen(giveaway = {}) {
  const now = Date.now();
  const startsAt = giveaway.startsAt ? new Date(giveaway.startsAt).getTime() : 0;
  const endsAt = giveaway.endsAt ? new Date(giveaway.endsAt).getTime() : Infinity;
  return Boolean(giveaway.enabled && startsAt <= now && now < endsAt);
}

async function giveawayAdminRequest(url, options = {}) {
  const response = await fetch(url, options);
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    await showInfo(payload.error || "Действието не успя. Опитай отново.");
    return false;
  }
  return payload;
}

function csvCell(value = "") {
  const text = String(value);
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replaceAll('"', '""')}"`;
}

function exportGiveawayEntries() {
  const header = ["Име", "Имейл", "Социален профил", "Допуснат", "Победител", "Награда", "Записан на"];
  const rows = giveawayEntriesCache.map((entry) => [
    entry.name,
    entry.email,
    entry.socialHandle || "",
    entry.eligible === false ? "Не" : "Да",
    entry.winnerRank ? `#${entry.winnerRank}` : "",
    entry.prizeName || "",
    formatAdminDate(entry.createdAt)
  ]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `dis-giveaway-${adminConfig.giveaway?.id || "participants"}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.addEventListener("click", async (event) => {
  const giveaway = adminConfig.giveaway;
  if (!giveaway?.id) return;

  if (event.target.closest("[data-export-giveaway-entries]")) {
    exportGiveawayEntries();
    return;
  }

  if (event.target.closest("[data-draw-giveaway]")) {
    if (giveawayRegistrationIsOpen(giveaway)) {
      await showInfo("Giveaway все още е активен и приема участници. Премахни отметката „Покажи giveaway в сайта“ и натисни „Запази Фен зона“. След това тегленето ще бъде разрешено.");
      return;
    }
    const winnerCount = giveawayWinnerCount(giveaway);
    if (!(await askConfirmation(`Ще бъдат изтеглени ${winnerCount} победител(и), а наградите също ще бъдат разпределени на случаен принцип. Резултатът се запазва веднага.`, {
      title: "Теглене на победител",
      okLabel: "Изтегли"
    }))) return;
    const result = await giveawayAdminRequest("/api/giveaway/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giveawayId: giveaway.id })
    });
    if (result) {
      const participantNames = giveawayEntriesCache.filter((entry) => entry.eligible !== false).map((entry) => entry.name);
      await loadGiveawayEntries();
      showWinnerCelebration(result.winners || [], participantNames);
    }
    return;
  }

  if (event.target.closest("[data-reset-giveaway-winners]")) {
    const winnerNames = giveawayEntriesCache
      .filter((entry) => entry.winnerRank)
      .sort((first, second) => first.winnerRank - second.winnerRank)
      .map((entry) => `#${entry.winnerRank} ${entry.name}`)
      .join(", ");
    if (!(await askConfirmation(`Текущ резултат: ${winnerNames || "има изтеглен победител"}. Нулирането премахва този резултат веднага и позволява ново теглене. Не е необходимо допълнително натискане на „Запази“.`, {
      title: "Нулиране на победителите",
      okLabel: "Да, нулирай",
      danger: true
    }))) return;
    const succeeded = await giveawayAdminRequest("/api/giveaway/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ giveawayId: giveaway.id }) });
    if (succeeded) await loadGiveawayEntries();
    return;
  }

  if (event.target.closest("[data-clear-giveaway-entries]")) {
    if (!(await askConfirmation("Всички участници в този giveaway ще бъдат изтрити веднага и действието не може да бъде отменено. Не е необходимо допълнително натискане на „Запази“.", {
      title: "Изтриване на всички участници",
      okLabel: "Изтрий всички",
      danger: true
    }))) return;
    const succeeded = await giveawayAdminRequest(`/api/giveaway/entries?giveawayId=${encodeURIComponent(giveaway.id)}`, { method: "DELETE" });
    if (succeeded) await loadGiveawayEntries();
    return;
  }

  const card = event.target.closest("[data-giveaway-entry-id]");
  if (!card) return;
  const entryId = card.dataset.giveawayEntryId;

  if (event.target.closest("[data-delete-giveaway-entry]")) {
    if (!(await askConfirmation("Да изтрия ли окончателно този участник?"))) return;
    const succeeded = await giveawayAdminRequest(`/api/giveaway/entries/${encodeURIComponent(entryId)}`, { method: "DELETE" });
    if (succeeded) await loadGiveawayEntries();
    return;
  }

  if (event.target.closest("[data-toggle-giveaway-entry]")) {
    const excluded = card.classList.contains("is-ineligible");
    if (!(await askConfirmation(excluded ? "Да допусна ли този участник до тегленето?" : "Да изключа ли този участник от тегленето?"))) return;
    const succeeded = await giveawayAdminRequest(`/api/giveaway/entries/${encodeURIComponent(entryId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eligible: excluded })
    });
    if (succeeded) await loadGiveawayEntries();
  }
});

function messageTypeLabel(type) {
  return { idea: "Идея от фен", partner: "Партньорство", general: "Общ въпрос" }[type] || "Съобщение";
}

document.querySelector("#refresh-messages")?.addEventListener("click", loadMessages);

winnerModalCloseControls.forEach((control) => control.addEventListener("click", closeWinnerCelebration));

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(".admin-custom-select-trigger");
  const option = event.target.closest("[data-admin-select-value]");
  document.querySelectorAll("[data-admin-custom-select].is-open").forEach((select) => {
    if (!select.contains(event.target)) {
      select.classList.remove("is-open");
      select.querySelector(".admin-custom-select-menu").hidden = true;
      select.querySelector(".admin-custom-select-trigger").setAttribute("aria-expanded", "false");
    }
  });
  if (trigger) {
    const select = trigger.closest("[data-admin-custom-select]");
    const menu = select.querySelector(".admin-custom-select-menu");
    const opening = menu.hidden;
    menu.hidden = !opening;
    select.classList.toggle("is-open", opening);
    trigger.setAttribute("aria-expanded", String(opening));
  }
  if (option) {
    const select = option.closest("[data-admin-custom-select]");
    const input = select.querySelector('[name="messageStatus"]');
    input.value = option.dataset.adminSelectValue;
    select.querySelector("[data-admin-select-label]").textContent = option.textContent.trim();
    select.querySelectorAll("[data-admin-select-value]").forEach((item) => {
      const selected = item === option;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-selected", String(selected));
    });
    select.classList.remove("is-open");
    select.querySelector(".admin-custom-select-menu").hidden = true;
    select.querySelector(".admin-custom-select-trigger").setAttribute("aria-expanded", "false");
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
});

document.addEventListener("change", async (event) => {
  const select = event.target.closest('[name="messageStatus"]');
  if (!select) return;
  const card = select.closest("[data-message-id]");
  const previous = card.className.match(/status-([^\s]+)/)?.[1] || "new";
  if (!(await askConfirmation("Да запазя ли новия статус на съобщението?"))) {
    await loadMessages();
    return;
  }
  const response = await fetch(`/api/messages/${encodeURIComponent(card.dataset.messageId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: select.value })
  });
  if (!response.ok) setStatus("Статусът не беше запазен.", true);
  await loadMessages();
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-message]");
  if (!button) return;
  const card = button.closest("[data-message-id]");
  if (!(await askConfirmation("Сигурен ли си, че искаш да изтриеш това съобщение окончателно?"))) return;
  const response = await fetch(`/api/messages/${encodeURIComponent(card.dataset.messageId)}`, { method: "DELETE" });
  if (!response.ok) setStatus("Съобщението не беше изтрито.", true);
  await loadMessages();
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST" });
  } finally {
    window.location.href = "/login";
  }
});

window.DIS_PWA_REFRESH = () => loadAdminContent({ rethrow: true });
loadAdminContent();
