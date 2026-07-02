/**
 * subscribers.js — ניהול רשימת נרשמים
 * שומר ב-data/subscribers.json (דיסק זמני של Render — מאופס בכל deploy/restart)
 * לשמירה קבועה: שדרג ל-Render disk בתשלום, או חבר Google Sheet / Airtable חינמי
 */

const fs   = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "data", "subscribers.json");

function load() {
  if (!fs.existsSync(FILE)) return [];
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { return []; }
}

function save(list) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

function subscribe(email, frequency) {
  const list = load();
  const existing = list.find(s => s.email === email);
  if (existing) {
    existing.frequency = frequency;
    existing.updatedAt = new Date().toISOString();
    save(list);
    return { updated: true, sub: existing };
  }
  const sub = {
    email,
    frequency,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confirmed: false,
    token: Math.random().toString(36).slice(2) + Date.now().toString(36),
    lastSentAt: null,
  };
  list.push(sub);
  save(list);
  return { created: true, sub };
}

function confirm(token) {
  const list = load();
  const sub = list.find(s => s.token === token);
  if (!sub) return false;
  sub.confirmed = true;
  save(list);
  return sub;
}

function unsubscribe(token) {
  let list = load();
  const before = list.length;
  list = list.filter(s => s.token !== token);
  if (list.length < before) { save(list); return true; }
  return false;
}

function getByFrequency(freq) {
  return load().filter(s => s.confirmed && s.frequency === freq);
}

function markSent(email) {
  const list = load();
  const sub = list.find(s => s.email === email);
  if (sub) { sub.lastSentAt = new Date().toISOString(); save(list); }
}

function getAll() { return load(); }

module.exports = { subscribe, confirm, unsubscribe, getByFrequency, markSent, getAll };
