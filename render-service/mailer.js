/**
 * mailer.js — שולח מיילים דרך Gmail (App Password)
 * env vars: GMAIL_USER, GMAIL_PASS, BASE_URL, PAGES_URL
 */

const nodemailer = require("nodemailer");

const BASE_URL  = process.env.BASE_URL  || "https://evia-news-signup.onrender.com";
const PAGES_URL = process.env.PAGES_URL || "https://YOUR_USERNAME.github.io/evia-news";

function createTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
  });
}

function buildNewsletterHTML(digest, subscriber) {
  const { generatedAt, sections = [] } = digest;
  const unsubUrl = `${BASE_URL}/unsubscribe?token=${subscriber.token}`;

  const CAT_COLORS = {
    urgent:"#c94f4f", infra:"#d4882a", environment:"#2a9e8e",
    crime:"#9e5a2a", economy:"#6050c0", tourism:"#2a9e5e",
    politics:"#7a5ab4", other:"#4a6a8a",
  };

  let sectionsHTML = "";
  for (const sec of sections) {
    if (!sec.items?.length) continue;
    let itemsHTML = "";
    for (const item of sec.items) {
      const color = CAT_COLORS[sec.type] || "#4a6a8a";
      const imgHTML = item.image
        ? `<img src="${item.image}" alt="" style="width:100%;max-height:180px;object-fit:cover;border-radius:6px 6px 0 0;display:block">`
        : "";
      const locsHTML = (item.locations || []).length
        ? `<p style="margin:6px 0 0;font-size:12px;color:#7a9ab4">📍 ${item.locations.join(" · ")}</p>`
        : "";
      itemsHTML += `
        <div style="background:#162131;border-radius:8px;overflow:hidden;margin-bottom:10px;border-right:4px solid ${color}">
          ${imgHTML}
          <div style="padding:12px 14px">
            <p style="margin:0 0 4px;font-size:10px;color:${color};font-weight:700;text-transform:uppercase">${item.label} &nbsp;·&nbsp; <span style="color:#6a8ba5">${item.date || ""}</span> &nbsp;·&nbsp; <span style="color:#4a6a8a">${item.source || ""}</span></p>
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#eef2f8">${item.title}</p>
            <p style="margin:0 0 6px;font-size:13px;color:#8aaccc;line-height:1.7">${item.body}</p>
            ${locsHTML}
            ${item.url ? `<a href="${item.url}" style="display:inline-block;margin-top:8px;font-size:11px;color:#2272cc;text-decoration:none">קרא את הכתבה המקורית ←</a>` : ""}
          </div>
        </div>`;
    }
    sectionsHTML += `
      <div style="margin-bottom:24px">
        <p style="margin:0 0 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#4a7a9a">${sec.label}</p>
        ${itemsHTML}
      </div>`;
  }

  const freqLabel = { daily:"יומי", weekly:"שבועי", immediate:"מיידי" };

  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a1628;font-family:Arial,sans-serif;direction:rtl">
<div style="max-width:620px;margin:0 auto;padding:24px 16px">
  <div style="background:#111f35;border-radius:12px 12px 0 0;padding:20px 24px;text-align:center;border-bottom:1px solid #1e3050">
    <h1 style="margin:0;font-size:20px;color:#fff">🇬🇷 חדשות אוויה בעברית</h1>
    <p style="margin:6px 0 0;font-size:12px;color:#6a8ba5">ניוזלטר ${freqLabel[subscriber.frequency]||""} · ${generatedAt || ""}</p>
  </div>
  <div style="background:#1a1200;padding:8px 16px;text-align:center;font-size:12px;color:#c8a440">
    ⚠️ <strong>תוכן זה מופק אוטומטית על ידי AI ועשוי לכלול טעויות תרגום</strong>
  </div>
  <div style="background:#0d1b2a;padding:20px 16px">${sectionsHTML}</div>
  <div style="background:linear-gradient(135deg,#0d2a1a,#0a1f28);border:1px solid #1a4a2a;border-radius:10px;padding:16px 18px;margin-top:16px;display:flex;align-items:center;gap:12px">
    <span style="font-size:28px">🏡</span>
    <div>
      <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#7adba0">יש לנו דירה בכפר Nerotrivia באי אוויה</p>
      <p style="margin:0;font-size:12px;color:#5a8a6a">מחפשים מקום לנפוש? <a href="https://nerotrivia.com/" style="color:#2a9e5e">nerotrivia.com</a></p>
    </div>
  </div>
  <div style="text-align:center;padding:18px 0;font-size:11px;color:#3a5a74;line-height:1.9">
    נבנה על ידי <strong style="color:#5a7a9a">רומן גרינשטיין</strong> ·
    <a href="mailto:romangash@gmail.com" style="color:#2272cc;text-decoration:none">romangash@gmail.com</a>
    <br><a href="${unsubUrl}" style="color:#3a5a74;font-size:11px">הסרה מהרשימה</a>
    &nbsp;·&nbsp; <a href="${PAGES_URL}" style="color:#3a5a74;font-size:11px">צפה באתר</a>
  </div>
</div>
</body></html>`;
}

async function sendNewsletter(subscribers, digest) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.warn("⚠️  GMAIL_USER / GMAIL_PASS not set — skipping email");
    return { sent: 0, failed: 0 };
  }
  const transport = createTransport();
  let sent = 0, failed = 0;
  for (const sub of subscribers) {
    try {
      const html = buildNewsletterHTML(digest, sub);
      await transport.sendMail({
        from: `"חדשות אוויה" <${process.env.GMAIL_USER}>`,
        to: sub.email,
        subject: `📰 חדשות אוויה — ${digest.generatedAt || new Date().toLocaleDateString("he-IL")}`,
        html,
      });
      sent++;
    } catch (e) { failed++; console.error(`  ❌ Failed ${sub.email}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 500));
  }
  return { sent, failed };
}

async function sendConfirmation(email, token, frequency) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) return;
  const transport = createTransport();
  const confirmUrl = `${BASE_URL}/confirm?token=${token}`;
  const freqLabel = { daily:"יומי", weekly:"שבועי", immediate:"מיידי" }[frequency] || frequency;

  await transport.sendMail({
    from: `"חדשות אוויה" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "✅ אשר את הרשמתך לחדשות אוויה",
    html: `
      <div dir="rtl" style="font-family:Arial;max-width:480px;margin:auto;padding:24px;background:#0a1628;color:#dde6f0;border-radius:12px">
        <h2 style="color:#fff">🇬🇷 חדשות אוויה — אישור הרשמה</h2>
        <p style="color:#8aaccc;line-height:1.7">נרשמת לניוזלטר <strong style="color:#fff">${freqLabel}</strong>.<br>לחץ לאישור המייל:</p>
        <a href="${confirmUrl}" style="display:inline-block;margin:16px 0;background:#2272cc;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700">✅ אשר הרשמה</a>
        <p style="font-size:11px;color:#3a5a74;margin-top:16px">אם לא נרשמת, התעלם מהמייל הזה.</p>
      </div>`,
  });
}

module.exports = { sendNewsletter, sendConfirmation, buildNewsletterHTML };
