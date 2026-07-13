let adminConfig = structuredClone(window.DIS_SITE_CONFIG);
let savedConfig = structuredClone(window.DIS_SITE_CONFIG);
const storedConfig = localStorage.getItem("dis-site-config");
if (storedConfig) adminConfig = JSON.parse(storedConfig);
let previousPages = {};

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
const hostsEditor = document.querySelector("#hosts-editor");
const messagesEditor = document.querySelector("#messages-editor");
const inboxCount = document.querySelector("#inbox-count");
const footerEditor = document.querySelector("#footer-editor");
const footerLinksEditor = document.querySelector("#footer-links-editor");
const footerSocialsEditor = document.querySelector("#footer-socials-editor");
const confirmModal = document.querySelector("#confirm-modal");
const confirmMessage = document.querySelector("#confirm-message");
const confirmOk = document.querySelector("[data-confirm-ok]");
const confirmAlt = document.querySelector("[data-confirm-alt]");
const confirmCancelControls = document.querySelectorAll("[data-confirm-cancel]");
let pendingConfirmation = null;

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
  confirmMessage.textContent = message;
  confirmOk.textContent = options.okLabel || "Потвърди";
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
  confirmOk.textContent = "Потвърди";
  confirmAlt.hidden = true;
  confirmAlt.style.display = "none";
  pendingConfirmation(answer);
  pendingConfirmation = null;
}

async function showInfo(message) {
  await askConfirmation(message, { okLabel: "Разбрах" });
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
      host: "този водещ",
      "footer-link": "този footer линк",
      "footer-social": "тази footer социална мрежа"
    }[type] || "този елемент"
  );
}

async function loadAdminContent() {
  try {
    const response = await fetch("/api/content", { headers: { Accept: "application/json" } });
    if (response.ok) adminConfig = await response.json();
  } catch {
    setStatus("Static preview mode: changes will save only in this browser.");
  }

  adminConfig = withDefaults(adminConfig);
  savedConfig = structuredClone(adminConfig);
  previousPages = JSON.parse(localStorage.getItem("dis-previous-pages") || "{}");
  renderEditors();
  loadMessages();
}

function withDefaults(config) {
  const fallback = structuredClone(window.DIS_SITE_CONFIG);
  const sectionKeys = new Set([...Object.keys(fallback.sections || {}), ...Object.keys(config.sections || {})]);
  const sections = {};
  sectionKeys.forEach((key) => {
    sections[key] = { ...(fallback.sections?.[key] || {}), ...(config.sections?.[key] || {}) };
  });
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
    news: config.news || fallback.news || [],
    formats: config.formats || fallback.formats || [],
    adSlots: config.adSlots || fallback.adSlots || [],
    activeAds: config.activeAds || fallback.activeAds || [],
    stats: config.stats || fallback.stats || [],
    sponsorPackages: config.sponsorPackages || fallback.sponsorPackages || [],
    hosts: config.hosts || fallback.hosts || [],
    predictions: config.predictions || fallback.predictions || [],
    polls: config.polls || fallback.polls || [],
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

function hiddenField(name, value = "") {
  return `<input name="${name}" type="hidden" value="${escapeValue(value)}" />`;
}

function readonlyInfo(label, value = "") {
  return `
    <div class="mini-field readonly-field">
      <span>${label}</span>
      <p>${escapeValue(value)}</p>
    </div>
  `;
}

function fileField(label, accept, target = "") {
  return `
    <label class="mini-field">
      <span>${label}</span>
      <input data-upload ${target ? `data-upload-target="${escapeValue(target)}"` : ""} type="file" accept="${accept}" />
    </label>
  `;
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
      (item, index) => `
        <article class="editor-card" data-index="${index}">
          <button class="remove-card" data-remove="news" type="button" aria-label="Премахни">x</button>
          <h3>${escapeValue(item.title || "Новина")}</h3>
          ${field("Заглавие", "title", item.title || "")}
          ${readonlyInfo("Дата - автоматично", formatAdminDate(item.createdAt))}
          ${textarea("Текст", "body", item.body || "", 5)}
          ${hiddenField("imageUrl", item.imageUrl || "")}
          ${fileField("Качи снимка", "image/*", `news.${index}.image`)}
          <div class="wide">
            <span class="upload-title">Снимка към новината</span>
            ${mediaPreview(item.imageUrl || "", "image")}
          </div>
        </article>
      `
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
        ${textarea("Опции - една на ред", "options", (poll.options || []).map((option) => option.label).join("\n"), 5)}
      </article>`)
    .join("");

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

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Upload failed");
  }

  return response.json();
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
  if (!url.startsWith("/uploads/")) return "";
  return url.split("/").filter(Boolean).pop() || "";
}

function countMediaUsages(url = "") {
  if (!url) return 0;
  let count = 0;
  if (adminConfig.brand?.logo === url) count += 1;
  if (adminConfig.brand?.heroImage === url) count += 1;
  (adminConfig.activeAds || []).forEach((ad) => {
    if (ad.mediaUrl === url) count += 1;
  });
  (adminConfig.news || []).forEach((item) => {
    if (item.imageUrl === url) count += 1;
  });
  Object.values(adminConfig.pages || {}).forEach((page) => {
    if (page.image === url) count += 1;
  });
  (adminConfig.hosts || []).forEach((host) => {
    if (host.imageUrl === url) count += 1;
  });
  if (adminConfig.sections?.news?.image === url) count += 1;
  return count;
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

  if (target === "sections.news.image") adminConfig.sections.news.image = url;
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
        title: value(card, "title"),
        body: value(card, "body"),
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
      const previousOptions = adminConfig.polls?.[index]?.options || [];
      return {
        id: value(card, "id") || `poll-${Date.now()}-${index}`,
        title: value(card, "title"),
        match: value(card, "match"),
        question: value(card, "question"),
        status: value(card, "status") || "active",
        resultsVisible: Boolean(card.querySelector('[name="resultsVisible"]')?.checked),
        closesAt: value(card, "closesAt") ? new Date(value(card, "closesAt")).toISOString() : "",
        options: lines(value(card, "options")).map((label, optionIndex) => ({
          id: previousOptions[optionIndex]?.id || `option-${Date.now()}-${optionIndex}`,
          label
        }))
      };
    }),
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
  }
  if (page === "home") {
    target.hero = source.hero;
    ["socials", "latest", "formats"].forEach((key) => { target.sections[key] = source.sections[key]; });
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
    target.predictions = source.predictions;
    target.polls = source.polls;
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

function restorePage(page, snapshot) {
  applyPage(adminConfig, page, snapshot);
}

document.querySelectorAll("[data-save-page]").forEach((button) => {
  button.addEventListener("click", async () => {
    const page = button.dataset.savePage;
    if (!(await askConfirmation(`Сигурен ли си, че искаш да запазиш „${button.textContent.replace("Запази", "").trim()}“?`))) return;
    const draftConfig = collectConfig();
    const nextConfig = withDefaults(structuredClone(savedConfig));
    applyPage(nextConfig, page, draftConfig);
    previousPages[page] = structuredClone(savedConfig);
    localStorage.setItem("dis-previous-pages", JSON.stringify(previousPages));
    try {
      const response = await fetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig)
      });
      if (!response.ok) throw new Error("Backend save failed");
      savedConfig = withDefaults(await response.json());
      applyPage(adminConfig, page, savedConfig);
      localStorage.removeItem("dis-site-config");
      setStatus("Промените са запазени.");
    } catch {
      savedConfig = structuredClone(nextConfig);
      applyPage(adminConfig, page, nextConfig);
      localStorage.setItem("dis-site-config", JSON.stringify(nextConfig));
      setStatus("Запазено е само в този браузър. Стартирай server.js за server save.", true);
    }
  });
});

document.querySelectorAll("[data-revert-page]").forEach((button) => {
  button.addEventListener("click", async () => {
    const page = button.dataset.revertPage;
    if (!previousPages[page]) return showInfo("За този раздел все още няма предишна запазена версия.");
    if (!(await askConfirmation("Да върна ли предишната версия на този раздел в редактора? След това натисни Запази, за да я публикуваш."))) return;
    adminConfig = collectConfig();
    restorePage(page, previousPages[page]);
    renderEditors();
    setStatus("Предишната версия е върната в редактора.");
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
      adminConfig.news.unshift({ title: "Нова новина", body: "Кратък текст към новината.", imageUrl: "", createdAt: new Date().toISOString() });
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
  const removeHostImageButton = event.target.closest("[data-remove-host-image]");
  if (removeHostImageButton) {
    if (!(await askConfirmation("Сигурен ли си, че искаш да изтриеш снимката на този водещ?"))) return;
    syncBeforeMutating();
    const index = Number(removeHostImageButton.dataset.removeHostImage);
    const imageUrl = adminConfig.hosts?.[index]?.imageUrl || "";
    const shouldDeleteUpload = filenameFromUploadUrl(imageUrl) && countMediaUsages(imageUrl) <= 1;
    if (adminConfig.hosts?.[index]) adminConfig.hosts[index].imageUrl = "";
    if (shouldDeleteUpload) {
      try {
        await deleteLocalUploadByUrl(imageUrl);
      } catch (error) {
        setStatus(`Снимката е премахната от профила, но файлът не беше изтрит: ${error.message}`, true);
      }
    }
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
    if (media?.url?.startsWith("/uploads/")) {
      try {
        await deleteUploadFile(filename);
      } catch (error) {
        setStatus(`Файлът не беше изтрит от диска: ${error.message}`, true);
      }
    }

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
  if (!(await askConfirmation(`Сигурен ли си, че искаш да премахнеш ${removalLabel(type)}?`))) return;

  syncBeforeMutating();
  const card = removeButton.closest(".editor-card");
  const index = Number(card.dataset.index);
  if (type === "nav") adminConfig.nav.splice(index, 1);
  if (type === "social") adminConfig.socials.splice(index, 1);
  if (type === "format") adminConfig.formats.splice(index, 1);
  if (type === "news") {
    const removedNews = adminConfig.news[index];
    const removedImageUrl = removedNews?.imageUrl || "";
    const shouldDeleteUpload = filenameFromUploadUrl(removedImageUrl) && countMediaUsages(removedImageUrl) <= 1;
    adminConfig.news.splice(index, 1);
    if (shouldDeleteUpload) {
      try {
        await deleteLocalUploadByUrl(removedImageUrl);
      } catch (error) {
        setStatus(`Новината е премахната, но снимката не беше изтрита от uploads: ${error.message}`, true);
      }
    }
  }
  if (type === "ad") adminConfig.adSlots.splice(index, 1);
  if (type === "active-ad") {
    const removedAd = adminConfig.activeAds[index];
    const removedMediaUrl = removedAd?.mediaUrl || "";
    const shouldDeleteUpload = filenameFromUploadUrl(removedMediaUrl) && countMediaUsages(removedMediaUrl) <= 1;
    adminConfig.activeAds.splice(index, 1);
    if (shouldDeleteUpload) {
      try {
        await deleteLocalUploadByUrl(removedMediaUrl);
      } catch (error) {
        setStatus(`Рекламата е премахната, но файлът не беше изтрит от папката uploads: ${error.message}`, true);
      }
    }
  }
  if (type === "stat") adminConfig.stats.splice(index, 1);
  if (type === "package") adminConfig.sponsorPackages.splice(index, 1);
  if (type === "prediction") adminConfig.predictions.splice(index, 1);
  if (type === "poll") adminConfig.polls.splice(index, 1);
  if (type === "footer-link") adminConfig.footer.links.splice(index, 1);
  if (type === "footer-social") adminConfig.footer.socials.splice(index, 1);
  if (type === "host") {
    const removedHost = adminConfig.hosts[index];
    const removedImageUrl = removedHost?.imageUrl || "";
    const shouldDeleteUpload = filenameFromUploadUrl(removedImageUrl) && countMediaUsages(removedImageUrl) <= 1;
    adminConfig.hosts.splice(index, 1);
    if (shouldDeleteUpload) {
      try {
        await deleteLocalUploadByUrl(removedImageUrl);
      } catch (error) {
        setStatus(`Водещият е премахнат, но снимката не беше изтрита: ${error.message}`, true);
      }
    }
  }
  renderEditors();
});

document.addEventListener("change", (event) => {
  const recommendedInput = event.target.closest('[name="recommended"]');
  if (!recommendedInput || !recommendedInput.checked) return;
  packagesEditor.querySelectorAll('[name="recommended"]').forEach((input) => {
    if (input !== recommendedInput) input.checked = false;
  });
});

confirmOk.addEventListener("click", () => closeConfirmation(true));
confirmAlt.addEventListener("click", () => closeConfirmation("alt"));
confirmCancelControls.forEach((control) => {
  control.addEventListener("click", () => closeConfirmation(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.hidden) closeConfirmation(false);
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
  setStatus(`Качване на ${file.name}...`);

  try {
    syncBeforeMutating();
    const adMatch = target.match(/^activeAds\.(\d+)\.media$/);
    const oldActiveAdMediaUrl = adMatch ? adminConfig.activeAds[Number(adMatch[1])]?.mediaUrl || "" : "";
    const newsMatch = target.match(/^news\.(\d+)\.image$/);
    const oldNewsImageUrl = newsMatch ? adminConfig.news[Number(newsMatch[1])]?.imageUrl || "" : "";
    const pageMatch = target.match(/^pages\.([a-zA-Z]+)\.image$/);
    const oldPageImageUrl = pageMatch ? adminConfig.pages?.[pageMatch[1]]?.image || "" : "";
    const hostMatch = target.match(/^hosts\.(\d+)\.image$/);
    const oldHostImageUrl = hostMatch ? adminConfig.hosts?.[Number(hostMatch[1])]?.imageUrl || "" : "";
    const oldNewsHeroUrl = target === "sections.news.image" ? adminConfig.sections?.news?.image || "" : "";
    const oldUploadUrl = oldActiveAdMediaUrl || oldNewsImageUrl || oldPageImageUrl || oldHostImageUrl || oldNewsHeroUrl;
    const canDeleteOldUpload = oldUploadUrl && filenameFromUploadUrl(oldUploadUrl) && countMediaUsages(oldUploadUrl) <= 1;
    const result = await uploadFile(file);
    if (target) {
      selectMedia(target, result.url, result.type);
      if (canDeleteOldUpload) {
        await deleteLocalUploadByUrl(oldUploadUrl);
      }
    } else {
      addUploadResult(result);
    }
    renderEditors();
    setStatus(target ? "Файлът е качен и избран. Натисни Запази промените." : "Файлът е добавен в историята за лого/background.");
  } catch (error) {
    setStatus(`Качването не успя: ${error.message}`, true);
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

function messageTypeLabel(type) {
  return { idea: "Идея от фен", partner: "Партньорство", general: "Общ въпрос" }[type] || "Съобщение";
}

document.querySelector("#refresh-messages")?.addEventListener("click", loadMessages);

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

loadAdminContent();
