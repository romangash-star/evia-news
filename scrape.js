/**
 * scrape.js — סורק 5 אתרי חדשות אוויה, קורא כל כתבה במלואה, מסכם בעברית
 * רץ ע"י GitHub Actions (לא בשרת) — כותב ל-docs/data/digest.json
 * הרצה ידנית: node scrape.js
 */

const Anthropic = require("@anthropic-ai/sdk");
const axios      = require("axios");
const cheerio    = require("cheerio");
const fs         = require("fs");
const path       = require("path");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SOURCES = [
  { name: "evima.gr",     url: "https://www.evima.gr/",        articlePattern: /evima\.gr\/.+\/.+/,    minTitleLen: 10 },
  { name: "eviazoom.gr",  url: "https://www.eviazoom.gr/",      articlePattern: /eviazoom\.gr\/.+/,     minTitleLen: 10 },
  { name: "eviathema.gr", url: "https://eviathema.gr/evoia/",   articlePattern: /eviathema\.gr\/.+/,    minTitleLen: 10 },
  { name: "evianews.com", url: "https://evianews.com/",         articlePattern: /evianews\.com\/.+/,    minTitleLen: 8  },
  { name: "egnomi.gr",    url: "https://www.egnomi.gr/home",    articlePattern: /egnomi\.gr\/.+/,       minTitleLen: 8  },
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; EviaDigestBot/2.0; +https://github.com/evia-news)",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "el,en;q=0.9",
};

// ── שלוף דף הבית ואסוף קישורים לכתבות ─────────────────────
async function fetchIndex(source) {
  try {
    const res = await axios.get(source.url, { timeout: 15000, headers: HEADERS });
    const $ = cheerio.load(res.data);
    const seen = new Set();
    const links = [];

    $("a[href]").each((_, el) => {
      const href  = $(el).attr("href") || "";
      const title = $(el).text().trim();
      if (
        !seen.has(href) &&
        source.articlePattern.test(href) &&
        title.length >= source.minTitleLen &&
        !href.includes("?") &&
        !href.match(/\/(tag|category|author|page)\//i)
      ) {
        seen.add(href);
        links.push({ href, title });
      }
    });

    console.log(`  ${source.name}: ${links.length} links found`);
    return links.slice(0, 6); // מקסימום 6 כתבות לאתר (30 סה"כ — חוסך עלות API)
  } catch (e) {
    console.warn(`  ⚠️  ${source.name} index failed: ${e.message}`);
    return [];
  }
}

// ── קרא כתבה מלאה ושלוף: תוכן + תמונה + תאריך ─────────────
async function fetchArticle(href) {
  try {
    const res = await axios.get(href, { timeout: 12000, headers: HEADERS });
    const $ = cheerio.load(res.data);

    let image =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $("article img[src*='wp-content/uploads']").first().attr("src") ||
      $(".post-thumbnail img, .featured-image img, .entry-thumbnail img").first().attr("src") ||
      "";
    if (image && (image.includes("grey.gif") || image.includes("placeholder"))) image = "";

    let date =
      $('meta[property="article:published_time"]').attr("content")?.slice(0, 16).replace("T", " ") ||
      $("time[datetime]").first().attr("datetime")?.slice(0, 16).replace("T", " ") ||
      "";

    let content = "";
    const bodySelectors = [".entry-content", ".post-content", "article .content", ".article-body", "article"];
    for (const sel of bodySelectors) {
      const el = $(sel);
      if (el.length) {
        content = el.find("p").map((_, p) => $(p).text().trim()).get()
          .filter(t => t.length > 40).slice(0, 6).join(" ");
        if (content.length > 100) break;
      }
    }
    if (!content) {
      content = $('meta[property="og:description"]').attr("content") ||
                $('meta[name="description"]').attr("content") || "";
    }

    return { image, date, content: content.slice(0, 1200) };
  } catch (e) {
    return { image: "", date: "", content: "" };
  }
}

// ── Claude: תרגם וסכם כתבה מלאה ─────────────────────────────
async function summariseOne(link, sourceName) {
  const article = await fetchArticle(link.href);

  const prompt = `Article from ${sourceName} on Evia island, Greece.
Title (Greek): "${link.title}"
Date: ${article.date || "recent"}
Body (Greek): ${article.content || "(no body available)"}

Translate and summarise into Hebrew. Return ONLY this JSON (no markdown):
{
  "cat": "urgent|infra|environment|crime|economy|tourism|politics|other",
  "label": "Hebrew category with emoji",
  "title": "Hebrew headline, max 12 words",
  "body": "3-4 sentence Hebrew summary with specific locations and key facts",
  "locations": ["location1", "location2"]
}

Categories: urgent=earthquakes/fires/emergencies/power-water outages, infra=roads/construction/infrastructure, environment=sea/nature/weather/animals, crime=arrests/accidents/scams, economy=payments/pensions/jobs/business, tourism=beaches/events/tourism, politics=local government/elections, other=misc local news`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",   // המודל הזול — מספיק לתרגום חדשות
      max_tokens: 400,
      system: "You are a Hebrew news editor. Always return valid JSON only, no extra text.",
      messages: [{ role: "user", content: prompt }]
    });

    const raw = msg.content.filter(b => b.type === "text").map(b => b.text).join("").trim()
      .replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();

    const parsed = JSON.parse(raw);
    return {
      cat:       parsed.cat       || "other",
      label:     parsed.label     || "📌 שונות",
      title:     parsed.title     || link.title,
      body:      parsed.body      || "",
      locations: Array.isArray(parsed.locations) ? parsed.locations : [],
      date:      article.date     || "",
      source:    sourceName,
      url:       link.href,
      image:     article.image    || "",
    };
  } catch (e) {
    console.warn(`  ⚠️  summarise failed for ${link.href}: ${e.message}`);
    return null;
  }
}

const CAT_ORDER = ["urgent","infra","environment","crime","economy","tourism","politics","other"];

function groupSections(items) {
  const map = {};
  for (const item of items) {
    const k = item.cat || "other";
    if (!map[k]) map[k] = { type: k, label: item.label, items: [] };
    map[k].items.push(item);
  }
  return CAT_ORDER.map(k => map[k]).filter(Boolean);
}

async function main() {
  console.log(`\n🔍 Evia News Scraper (GitHub Actions) — ${new Date().toLocaleString("he-IL")}`);
  console.log("━".repeat(55));

  const allLinks = [];
  for (const source of SOURCES) {
    const links = await fetchIndex(source);
    for (const link of links) allLinks.push({ ...link, sourceName: source.name });
    await new Promise(r => setTimeout(r, 800));
  }
  console.log(`\n📦 Total links: ${allLinks.length}`);

  const results = [];
  for (let i = 0; i < allLinks.length; i += 3) {
    const batch = allLinks.slice(i, i + 3);
    const settled = await Promise.allSettled(batch.map(l => summariseOne(l, l.sourceName)));
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
      else if (r.status === "rejected") console.warn("  ⚠️ ", r.reason?.message);
    }
    process.stdout.write(`  Summarised ${Math.min(i+3, allLinks.length)}/${allLinks.length}\r`);
    if (i + 3 < allLinks.length) await new Promise(r => setTimeout(r, 700));
  }
  console.log(`\n✅ Summarised: ${results.length} articles`);

  const digest = {
    generatedAt: new Date().toLocaleString("he-IL"),
    isoDate:     new Date().toISOString(),
    totalItems:  results.length,
    sourcesList: SOURCES.map(s => s.name),
    sections:    groupSections(results),
  };

  // ── כותב ל-docs/data — תיקיית GitHub Pages ──────────────
  const dataDir = path.join(__dirname, "docs", "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "digest.json"), JSON.stringify(digest, null, 2));

  const dateStr = new Date().toISOString().slice(0, 10);
  const archDir = path.join(dataDir, "archive");
  if (!fs.existsSync(archDir)) fs.mkdirSync(archDir, { recursive: true });
  fs.writeFileSync(path.join(archDir, `${dateStr}.json`), JSON.stringify(digest, null, 2));

  const totalItems = digest.sections.reduce((n, s) => n + s.items.length, 0);
  console.log(`📁 Saved ${totalItems} items in ${digest.sections.length} categories`);
  console.log(`📂 docs/data/digest.json + docs/data/archive/${dateStr}.json\n`);
  return digest;
}

main().catch(e => { console.error("❌ Fatal:", e.message); process.exit(1); });
module.exports = { main };
