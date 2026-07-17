const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RESEND_ENDPOINT,
  buildMessageEmail,
  resolveMessageRecipient,
  sendMessageEmail
} = require("../server/message-email");

function sampleMessage(overrides = {}) {
  return {
    id: "21b40d9b-4110-44c7-991f-fd61cc705f0d",
    type: "partner",
    name: "Test Person",
    email: "person@example.com",
    subject: "Sponsor\nrequest",
    company: "Example & Co",
    budget: "1000 лв.",
    message: "Здравейте <script>alert('x')</script>\nИмам предложение.",
    createdAt: "2026-07-16T10:30:00.000Z",
    ...overrides
  };
}

test("recipient matches the email displayed from footer content", () => {
  assert.equal(resolveMessageRecipient({
    footer: { email: "public@example.com" },
    sections: { contact: { email: "secondary@example.com" } }
  }), "public@example.com");
});

test("recipient falls back to the contact section and rejects invalid values", () => {
  assert.equal(resolveMessageRecipient({ footer: { email: "invalid" }, sections: { contact: { email: "contact@example.com" } } }), "contact@example.com");
  assert.equal(resolveMessageRecipient({ footer: { email: "invalid" } }), "");
});

test("email payload includes optional partner fields, safe HTML, and reply-to", () => {
  const email = buildMessageEmail({ message: sampleMessage(), from: "D.I.S <notify@example.com>", to: "team@example.com" });
  assert.equal(email.from, "D.I.S <notify@example.com>");
  assert.deepEqual(email.to, ["team@example.com"]);
  assert.equal(email.reply_to, "person@example.com");
  assert.match(email.subject, /^\[D\.I\.S\] Партньорство — Sponsor request$/);
  assert.match(email.text, /Компания: Example & Co/);
  assert.match(email.html, /&lt;script&gt;alert\(&#039;x&#039;\)&lt;\/script&gt;<br>Имам предложение\./);
  assert.doesNotMatch(email.html, /<script>/);
});

test("email payload omits empty optional fields and invalid reply-to", () => {
  const email = buildMessageEmail({
    message: sampleMessage({ type: "idea", email: "", subject: "", company: "", budget: "" }),
    from: "notify@example.com",
    to: "team@example.com"
  });
  assert.equal(email.reply_to, undefined);
  assert.match(email.subject, /^\[D\.I\.S\] Фен идея — Test Person$/);
  assert.doesNotMatch(email.text, /Компания:/);
});

test("send uses the Resend API, an idempotency key, and the current public recipient", async () => {
  let call;
  const fetchImpl = async (url, options) => {
    call = { url, options };
    return { ok: true, json: async () => ({ id: "provider-id" }) };
  };
  const result = await sendMessageEmail({
    message: sampleMessage(),
    content: { footer: { email: "team@example.com" } },
    apiKey: "secret",
    from: "notify@example.com",
    fetchImpl
  });
  assert.deepEqual(result, { id: "provider-id" });
  assert.equal(call.url, RESEND_ENDPOINT);
  assert.equal(call.options.headers.Authorization, "Bearer secret");
  assert.equal(call.options.headers["Idempotency-Key"], `message-${sampleMessage().id}`);
  assert.deepEqual(JSON.parse(call.options.body).to, ["team@example.com"]);
});

test("send surfaces provider failures without exposing the API key", async () => {
  await assert.rejects(
    sendMessageEmail({
      message: sampleMessage(),
      content: { footer: { email: "team@example.com" } },
      apiKey: "very-secret-key",
      from: "notify@example.com",
      fetchImpl: async () => ({ ok: false, status: 422, json: async () => ({ message: "Sender is not verified" }) })
    }),
    (error) => {
      assert.match(error.message, /Resend rejected the email \(422\): Sender is not verified/);
      assert.doesNotMatch(error.message, /very-secret-key/);
      return true;
    }
  );
});

test("send does not call the provider when the public recipient is invalid", async () => {
  let called = false;
  await assert.rejects(
    sendMessageEmail({
      message: sampleMessage(),
      content: { footer: { email: "not-an-email" } },
      apiKey: "secret",
      from: "notify@example.com",
      fetchImpl: async () => {
        called = true;
        return { ok: true, json: async () => ({ id: "unexpected" }) };
      }
    }),
    /public contact email is missing or invalid/i
  );
  assert.equal(called, false);
});
