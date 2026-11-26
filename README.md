# 🏏 Cricket Live Score

> Real live cricket scores on one clean page — live matches, upcoming fixtures and results, refreshed automatically so you never miss a wicket.

---

## ✨ About

**Cricket Live Score** pulls real scores from live sports sources and presents them in a simple, readable layout. Matches are grouped into **Live now**, **Upcoming** and **Results**, India matches are highlighted, and every view shows when it was last updated. If a refresh ever fails, the page honestly shows the last saved scores with their time instead of anything wrong.

## 🚀 Features

- 🔴 **Real live scores** — real matches from live sports sources (23 matches, 9 live at last check)
- 🗂️ **Clear grouping** — Live now / Upcoming / Results, with All, Live, Results and Upcoming tabs
- 🔍 **Search** — filter by team or tournament name
- 🇮🇳 **India highlighted** — India matches stand out in gold
- ⏱️ **Auto-refresh** — scores update every 60 seconds while the page is open, plus a Refresh button
- 🔄 **Background refresh** — a scheduled refresh every 30 minutes keeps scores current all day
- 🕒 **Updated timestamp** — every view shows when the scores were last refreshed

## 🎮 How to Use

1. Open the page — live matches are right at the top.
2. Switch tabs for upcoming fixtures or finished results.
3. Search for your team to see only their matches.

## 🛠️ Tech Stack

| Part | Technology |
| --- | --- |
| Frontend | React, TypeScript |
| Backend | Server actions fetching live sports sources |
| Storage | SQLite with Drizzle migrations (score snapshots) |

---

⭐ *Every ball, every wicket — live.*
