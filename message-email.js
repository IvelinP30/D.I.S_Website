const RESEND_ENDPOINT = "https://api.resend.com/emails";

const messageTypeLabels = {
  general: "Общ въпрос",
  idea: "Фен идея",
  partner: "Партньорство"
};

function isEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || "").trim());
}

function resolveMessageRecipient(content = {}) {
  const candidates = [content.footer?.email, content.sections?.contact?.email];
  return candidates.map((value) => String(value || "").trim()).find(isEmail) || "";
}

function cleanSubject(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatSubmittedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Sofia"
  }).format(date);
}

function messageRows(message) {
  return [
    ["Тип", messageTypeLabels[message.type] || messageTypeLabels.general],
    ["Име", message.name],
    ["Имейл", message.email],
    ["Тема", message.subject],
    ["Компания", message.company],
    ["Бюджет", message.budget],
    ["Получено", formatSubmittedAt(message.createdAt)]
  ].filter(([, value]) => String(value || "").trim());
}

function buildMessageEmail({ message, from, to }) {
  const typeLabel = messageTypeLabels[message.type] || messageTypeLabels.general;
  const detail = cleanSubject(message.subject || message.name).slice(0, 120);
  const subject = `[D.I.S] ${typeLabel}${detail ? ` — ${detail}` : ""}`;
  const rows = messageRows(message);
  const textDetails = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlDetails = rows
    .map(([label, value]) => `<tr><th align="left" style="padding:6px 14px 6px 0;color:#64748b;vertical-align:top">${escapeHtml(label)}</th><td style="padding:6px 0;color:#0f172a">${escapeHtml(value)}</td></tr>`)
    .join("");
  const escapedMessage = escapeHtml(message.message).replaceAll("\n", "<br>");
  const payload = {
    from,
    to: [to],
    subject,
    text: `Ново съобщение през сайта на D.I.S Подкаст\n\n${textDetails}\n\nСъобщение:\n${message.message}\n\nСъобщението е запазено и в admin панела.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a"><p style="color:#16a34a;font-weight:700;text-transform:uppercase;letter-spacing:.08em">D.I.S Подкаст</p><h1 style="font-size:24px;margin:0 0 20px">Ново съобщение през сайта</h1><table style="border-collapse:collapse;margin-bottom:22px">${htmlDetails}</table><div style="background:#f8fafc;border-left:4px solid #16a34a;padding:16px 18px;line-height:1.6">${escapedMessage}</div><p style="margin-top:22px;color:#64748b;font-size:13px">Съобщението е запазено и в admin панела.</p></div>`
  };
  if (isEmail(message.email)) payload.reply_to = message.email;
  return payload;
}

async function sendMessageEmail({ message, content, apiKey, from, fetchImpl = fetch, timeoutMs = 8000 }) {
  const to = resolveMessageRecipient(content);
  if (!to) throw new Error("The public contact email is missing or invalid.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `message-${message.id}`
      },
      body: JSON.stringify(buildMessageEmail({ message, from, to })),
      signal: controller.signal
    });
    if (!response.ok) {
      let providerMessage = "";
      try {
        const body = await response.json();
        providerMessage = cleanSubject(body?.message).slice(0, 240);
      } catch {
        // The status is enough when the provider did not return JSON.
      }
      throw new Error(`Resend rejected the email (${response.status})${providerMessage ? `: ${providerMessage}` : "."}`);
    }
    const result = await response.json();
    return { id: String(result?.id || "") };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  RESEND_ENDPOINT,
  buildMessageEmail,
  resolveMessageRecipient,
  sendMessageEmail
};
