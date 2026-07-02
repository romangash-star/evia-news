# חדשות אוויה — גרסת חינם 🇬🇷

ארכיטקטורה ב-$0/חודש (פרט ל-Anthropic API שעולה גרושים).

```
GitHub Actions (06:00 כל יום)
  ↓ מריץ scrape.js — סורק 5 אתרים, Claude מתרגם
  ↓ כותב docs/data/digest.json
  ↓ git commit + push
GitHub Pages (docs/)
  ↓ מגיש את index.html — קורא digest.json יחסית, מיידי
משתמש נכנס → רואה חדשות, אפס המתנה

Render free tier (render-service/)
  ↓ שירות נפרד וקטן — רק טופס הרשמה + שליחת מיילים
  ↓ self-ping כל 10 דק' כדי לא להירדם
```

## למה שני שירותים נפרדים?

GitHub Pages לא יכול להריץ קוד שרת (POST /api/subscribe) — הוא רק קבצים סטטיים.
לכן ההרשמה צריכה שרת אמיתי, אבל קטן ככל האפשר כדי שיתאים ל-Render free tier.

## עלות חודשית

| רכיב | עלות |
|------|------|
| GitHub (קוד + Actions + Pages) | **$0** |
| Render (שירות הרשמה) | **$0** |
| Anthropic API (Claude Haiku, ~30 כתבות/יום) | **~$0.30** |
| Gmail | **$0** |
| **סה"כ** | **~$0.30/חודש** |

## הגבלות הגרסה החינמית

1. **Render נרדם** — אחרי 15 דק' חוסר פעילות. ה-self-ping פותר את זה ברוב המקרים, אבל הפעם הראשונה ביום עשויה לקחת עד 30 שניות.
2. **נתוני נרשמים לא קבועים** — Render free tier מאפס את הדיסק בכל deploy/restart. לפתרון: חבר Google Sheet חינמי או שדרג לדיסק קבוע ($1/חודש).
3. **GitHub Actions** — 2,000 דקות חינם/חודש. סריקה יומית לוקחת ~5 דקות = 150 דקות/חודש. מרווח בטוח.
4. **שעון UTC** — ה-cron של GitHub Actions לא תומך timezone. הוגדר ל-03:00 UTC שזה 06:00 בקיץ ישראל (07:00 בחורף — סטייה של שעה, לא קריטי).

## מבנה הפרויקט

```
evia-free/
├── .github/workflows/daily-scrape.yml   ← GitHub Actions
├── scrape.js                            ← הסורק (רץ ע"י Actions)
├── package.json
├── docs/                                ← GitHub Pages
│   ├── index.html
│   └── data/digest.json                 ← נוצר אוטומטית
└── render-service/                      ← שרת ההרשמה (Render)
    ├── server.js
    ├── subscribers.js
    ├── mailer.js
    └── package.json
```
