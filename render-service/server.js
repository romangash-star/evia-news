/**
 * server.js — שירות ניוזלטר בלבד (Render free tier)
 * אין סריקה כאן! הסריקה רצה ב-GitHub Actions וכותבת ל-GitHub Pages.
 * השירות הזה רק: קולט הרשמות, שולח מייל אישור, שולח ניוזלטר לפי cron.
 */

const express = require("express");
const cron    = require("node-cron");
const axios   = require("axios");
const subs    = require("./subscribers");
const { sendNewsletter, sendConfirmation } = require("./mailer");

const app  = express();
const PORT = process.env.PORT || 3000;

// כתובת ה-digest.json שמתעדכן ע"י GitHub Actions
const DIGEST_URL = process.env.DIGEST_URL ||
  "https://YOUR_USERNAME.github.io/evia-news/data/digest.json";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS — מאפשר ל-GitHub Pages לקרוא לשירות הזה
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

async function fetchDigest() {
  const res = await axios.get(DIGEST_URL, { timeout: 10000 });
  return res.data;
}

// ── בריאות / השכמה ────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ ok: true, service: "evia-news-signup", time: new Date().toISOString() });
});
app.get("/health", (req, res) => res.json({ ok: true }));

// ── הרשמה ──────────────────────────────────────────────────
app.post("/api/subscribe", async (req, res) => {
  const { email, frequency } = req.body || {};
  if (!email || !email.includes("@"))
    return res.status(400).json({ error: "כתובת מייל לא תקינה" });
  if (!["daily","weekly","immediate"].includes(frequency))
    return res.status(400).json({ error: "תדירות לא תקינה" });

  const result = subs.subscribe(email, frequency);

  try {
    await sendConfirmation(email, result.sub.token, frequency);
    res.json({ ok: true, message: "נשלח מייל אישור! בדוק את תיבת הדואר שלך." });
  } catch (e) {
    console.error("Confirmation email failed:", e.message);
    res.json({ ok: true, message: "נרשמת! (לא הצלחנו לשלוח מייל אישור — בדוק שהגדרת GMAIL_USER/GMAIL_PASS)" });
  }
});

// ── אישור הרשמה ────────────────────────────────────────────
app.get("/confirm", (req, res) => {
  const sub = subs.confirm(req.query.token);
  if (!sub) {
    return res.send(`<html dir="rtl"><body style="font-family:Arial;text-align:center;padding:40px;background:#0a1628;color:#e08080">❌ קישור לא תקין או שפג תוקפו.</body></html>`);
  }
  const freqLabel = { daily:"יומי", weekly:"שבועי", immediate:"מיידי" }[sub.frequency] || sub.frequency;
  res.send(`<html dir="rtl"><body style="font-family:Arial;text-align:center;padding:40px;background:#0a1628;color:#dde6f0">
    <h2 style="color:#7adba0">✅ הרשמה אושרה!</h2>
    <p>תקבל את חדשות אוויה בניוזלטר <strong>${freqLabel}</strong>.</p>
  </body></html>`);
});

// ── הסרה ───────────────────────────────────────────────────
app.get("/unsubscribe", (req, res) => {
  const ok = subs.unsubscribe(req.query.token);
  res.send(`<html dir="rtl"><body style="font-family:Arial;text-align:center;padding:40px;background:#0a1628;color:#dde6f0">
    ${ok ? `<h2 style="color:#c8a440">הוסרת מהרשימה</h2>` : `<h2 style="color:#e08080">הקישור לא תקין</h2>`}
  </body></html>`);
});

// ── סטטוס (לבדיקה) ─────────────────────────────────────────
app.get("/api/status", (req, res) => {
  const all = subs.getAll();
  res.json({
    subscribers: all.length,
    confirmed:   all.filter(s => s.confirmed).length,
    digestUrl:   DIGEST_URL,
  });
});

// ── שליחה ידנית (לבדיקה) ───────────────────────────────────
app.post("/api/send-now", async (req, res) => {
  try {
    const digest = await fetchDigest();
    const freq   = req.body?.frequency || "daily";
    const list   = subs.getByFrequency(freq);
    const result = await sendNewsletter(list, digest);
    list.forEach(s => subs.markSent(s.email));
    res.json({ ok: true, ...result, recipients: list.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── cron: 06:30 שעון ישראל — אחרי שה-Action ב-06:00 כבר רץ ──
cron.schedule("30 3 * * *", async () => {  // 03:30 UTC ≈ 06:30 IL (קיץ)
  console.log("⏰ Sending daily + immediate newsletters...");
  try {
    const digest = await fetchDigest();
    const daily = subs.getByFrequency("daily");
    if (daily.length) {
      const r = await sendNewsletter(daily, digest);
      daily.forEach(s => subs.markSent(s.email));
      console.log(`  ✅ daily: ${r.sent} sent`);
    }
    const immediate = subs.getByFrequency("immediate");
    if (immediate.length) {
      const r2 = await sendNewsletter(immediate, digest);
      immediate.forEach(s => subs.markSent(s.email));
      console.log(`  📨 immediate: ${r2.sent} sent`);
    }
  } catch (e) { console.error("Cron failed:", e.message); }
});

// ── cron: ראשון 08:00 שעון ישראל — ניוזלטר שבועי ───────────
cron.schedule("0 5 * * 0", async () => {  // 05:00 UTC ≈ 08:00 IL
  try {
    const digest = await fetchDigest();
    const weekly = subs.getByFrequency("weekly");
    if (!weekly.length) return;
    const r = await sendNewsletter(weekly, digest);
    weekly.forEach(s => subs.markSent(s.email));
    console.log(`📅 weekly: ${r.sent} sent`);
  } catch (e) { console.error("Weekly cron failed:", e.message); }
});

// ── self-ping כל 10 דקות — מונע שינה ב-Render free tier ────
// (חיוני: cron לא רץ אם השירות ישן! ה-ping הזה שומר אותו ער)
const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) {
  cron.schedule("*/10 * * * *", async () => {
    try { await axios.get(`${SELF_URL}/health`, { timeout: 8000 }); }
    catch (_) { /* ignore */ }
  });
  console.log(`💓 Self-ping enabled → ${SELF_URL}/health every 10 min`);
} else {
  console.warn("⚠️  RENDER_EXTERNAL_URL not set — service may sleep after 15 min idle");
}

app.listen(PORT, () => {
  console.log(`\n📬  Evia News Signup Service`);
  console.log(`🌐  http://localhost:${PORT}`);
  console.log(`📡  Digest source: ${DIGEST_URL}`);
  console.log(`⏰  Daily/immediate email: 06:30 IL · Weekly: Sunday 08:00 IL\n`);
});
