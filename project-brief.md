# Projektübergabe — Portfolio Tracker (Portfolio-Pal)

Diese Vorlage ist für Projekte gedacht, die zwischen Claude Desktop, Zed, Cursor, Kimi und anderen Coding-Agenten wechseln. Sie hilft dabei, den Kontext knapp, wiederverwendbar und modellunabhängig zu halten.

---

## 1. Projekt auf einen Blick

**Projektname:** Portfolio Tracker (Arbeitstitel "Portfolio-Pal")

**Kurzbeschreibung:** Selbst-gehosteter, privacy-first Portfolio-Tracker für Aktien, ETFs und andere Wertpapiere. Läuft als zwei Docker-Container (Node/Express-Backend + SQLite, React-SPA via nginx). Live-Kurse über Yahoo Finance, FX über Frankfurter API, optional Alpha Vantage als Fallback.

**Projektart:** Web-App (Self-hosted, Docker-basiert, für Synology NAS gedacht, läuft aber auf jedem Docker-Host)

**Primäres Ziel:** Multi-Portfolio-Tracking mit Multi-Currency-Support, Live-Kursen, Analytics (Correlation/Monte-Carlo/Rebalancing) und einer ETF-Screener-Ansicht — ohne Cloud-Abhängigkeit, Daten bleiben lokal in SQLite.

**Aktueller Status:** In Arbeit / QA-Polishing — Kernfunktionen stehen, aktuelle Session war UI-Polish + Docker-Infra-Fix.

**Wichtigste Priorität in dieser Übergabe:** Keine offene Aufgabe — letzte Fixes sind committed, gepusht und nach `main` gemergt. Repo ist in stabilem, deploybarem Zustand.

---

## 2. Zielbild

Ein zuverlässiger, optisch konsistenter Portfolio-Tracker mit DE/EN-Lokalisierung und Light/Dark-Theming, der auf einer Synology NAS oder lokal via Docker läuft. Fokus liegt auf korrekter Multi-Currency-Berechnung, performanten Live-Kurs-Updates (mit aggressivem Caching gegen Yahoo-Finance-Rate-Limits) und einer aufgeräumten, theme-fähigen UI mit einheitlichem CSS-Designsystem (`rail-density-row`/`app-nav-tab`).

---

## 3. Was bereits entschieden ist

### Produkt / Inhalt
- Zielgruppe: Privatanleger, die ihr Portfolio selbst hosten wollen (kein SaaS, keine Cloud)
- Angebot: Tracking + Analytics für Aktien/ETFs über mehrere Portfolios und Währungen
- Kernbotschaft: Privacy-first, self-hosted, keine API-Keys zwingend nötig (Yahoo Finance braucht keinen Key)
- Haupt-CTA: Docker-Deploy via `make start`

### Design
- Gewünschte Stilrichtung: Dunkles Dashboard-UI mit optionalem Light-Mode ("Application-Pal"-Surface-Farben), Syne/Fira-Sans-Typografie
- Referenzen: eigenes "Application-Pal"-Designsystem (Light-Theme-Vorbild)
- Farben: CSS Custom Properties via `data-theme="dark|light"` auf `<body>`; Chart-Farben (grün/rot/gelb/accent) sind in beiden Themes identisch
- Typografie: `Syne` (dark/Standard), `Fira Sans` (light)
- No-Gos: keine Custom-Inline-Toggles mehr — Pflicht: `rail-density-row`/`rail-density-btn` und `app-nav-tab` als einzige Toggle-/Nav-Patterns

### Technik
- Stack: Node 18 + Express + better-sqlite3 (Backend), React 18 + Vite (Frontend)
- Framework/Library: kein Redux/Zustand — globaler State in `App()`, Props-Drilling; `react-i18next` für i18n; D3 für Analytics-Charts
- Styling-Ansatz: Inline `style={{}}` + globale CSS-Injection via `useGlobalStyles()`, keine CSS-Module/Tailwind
- Deployment-Ziel: Docker Compose, zwei Container (`portfolio-backend-v3`, `portfolio-frontend-v3`), optional Synology NAS
- Browser-/Gerätefokus: Desktop-Browser (kein explizites Mobile-Layout erkennbar)
- **Kein TypeScript, keine Tests, kein Linter, keine CI/CD** — bewusste Entscheidung laut `CLAUDE.md`

---

## 4. Source of Truth

- `README.md`: Feature-Übersicht, Screenshots, Setup-Anleitung — **maßgeblich für Produktbeschreibung**
- `CLAUDE.md`: **Primäre technische Source of Truth** — Architektur, Caching-Layer, CSS-Designsystem-Regeln, esbuild-TDZ-Footgun, DB-Schema, Branch-/Commit-Konventionen
- `project-brief.md` (diese Datei): Übergabe-Kontext zwischen Agent-Sessions/Tools
- Design-Dateien: keine (kein Figma/Penpot im Repo)
- API-Doku: keine separate Datei — Endpunkte sind in `CLAUDE.md` Abschnitt "Backend" dokumentiert
- GitHub PRs #1–#5: enthalten Implementierungs-Details vergangener Feature-Branches

**Regel:** Bei Widerspruch zwischen Chat-Aussagen und `CLAUDE.md`/`README.md` gelten die Dateien als führend.

---

## 5. Projektstruktur

```txt
fintools-new/
  backend/
    server.js          # ~2'600 Zeilen, einzige Backend-Datei, ASCII-Banner-Sektionen
    Dockerfile
    package.json
  frontend/
    src/
      App.jsx           # ~9'200 Zeilen, einzige Haupt-UI-Datei
      Analytics.jsx      # Correlation/Monte-Carlo/Rebalancing-Views
      i18n/
        index.js
        en/common.json
        de/common.json
    Dockerfile
    package.json
  data/                 # SQLite-DB (gitignored)
  backups/              # gzipped SQL-Dumps von `make backup`
  docs/screenshots/      # README-Screenshots
  docker-compose.yml
  CLAUDE.md
  README.md
  Makefile              # make start/stop/build/logs/backup/restore/stats
```

**Wichtige Dateien:**
- `backend/server.js` — Express-API: Users/Portfolios, Transactions/Savings-Plans, Settings, Quotes (Yahoo-Proxy), FX, Analytics-Endpunkte, Health/Stats
- `frontend/src/App.jsx` — Rail/Sidebar, TreeMap/BarChart/PerformanceView, TransactionList, ETF-Screener, Settings-Modal, i18n/Theme-Logik
- `frontend/src/Analytics.jsx` — Correlation-Matrix (dynamisch breiten-skalierend), Monte-Carlo (D3), Rebalancing

---

## 6. Aktueller Stand

### Was funktioniert bereits?
- Multi-Portfolio-Tracking mit Multi-Currency, BUY/SELL-Transaktionen, Savings-Plans
- Yahoo-Finance-Live-Kurse mit mehrstufigem Caching (`quotes_cache`, `parsed_quotes`, `etf_quote_summary_cache`)
- i18n (DE/EN) und Light/Dark-Theming vollständig integriert (auch in Analytics-Views)
- ETF-Screener mit eigenem Rail, das mit dem Portfolio-Rail visuell synchron ist
- Tooltip-System (`InfoTip`/`LabelTip`/`SidebarTip`/`RailBtn`) mit Viewport-Clamping und korrektem Verhalten in Comfort-Mode (CSS-`zoom`-Korrektur)
- Transaktionen können im Edit-Modus zwischen Portfolios verschoben werden
- Sticky/gepinnte Spalten in der Transaktionstabelle überlappen beim horizontalen Scrollen nicht mehr (opake Backgrounds via `inherit`)
- Docker-Deploy ist robust gegen macOS-tzdata-Updates (TZ-Env-Var statt `/etc/localtime`-Mount)

### Was ist nur teilweise gut?
- Keine automatisierten Tests — Regressionen werden nur manuell (curl/Browser/Docker-Logs) verifiziert
- Zwei sehr große Einzeldateien (`server.js` ~2'600 Zeilen, `App.jsx` ~9'200 Zeilen) — Navigation nur über ASCII-Banner-Suche

### Was funktioniert noch nicht?
- Keine bekannten offenen Bugs zum Zeitpunkt dieser Übergabe

### Bekannte Bugs / Schwächen
- esbuild-TDZ-Footgun: falsch geordnete `const`/`useEffect`-Deps können im **produktiven** Minified-Build zu `ReferenceError` führen (Dev-Mode zeigt das nicht) — siehe `CLAUDE.md` Abschnitt "esbuild TDZ trap"
- `yahoo-finance2` v3 loggt eine harmlose Node-Version-Warnung (Node 18 statt 22) — kein funktionales Problem

---

## 7. Nächste Aufgabe für den Agenten

**Konkrete Aufgabe jetzt:** Keine — diese Übergabe dokumentiert den Stand nach Abschluss von PR #5 (Docker-Timezone-Fix). Nächste Aufgabe wird vom Nutzer in einer neuen Session vorgegeben.

**Erwartetes Ergebnis:** —

**Definition of Done:** —

**Nicht tun:**
- Keine unnötigen Umbauten an `server.js`/`App.jsx`.
- Keine Änderung an bereits etablierten CSS-Patterns (`rail-density-row`, `app-nav-tab`) — neue Toggles/Tabs müssen diese wiederverwenden.
- Keine neuen Abhängigkeiten ohne Begründung (Projekt hat bewusst minimalen Dependency-Footprint).
- Keine externen Migrationsdateien für DB-Änderungen — neue Spalten per `ALTER TABLE`-Block direkt in `server.js`, analog zum bestehenden Muster.

---

## 8. Arbeitsregeln

### Inhaltlich
- Bestehende Entscheidungen respektieren (siehe `CLAUDE.md`).
- Erst verstehen, dann umbauen — `server.js`/`App.jsx` per Banner-Grep (`// ════`) navigieren statt komplett lesen.
- Kleine, nachvollziehbare Änderungen bevorzugen.
- Bei Unklarheit konservativ vorgehen.

### Für Code
- Bestehenden Stil respektieren: Inline-Styles + `THEME`-Objekt mit `var(--*)`-Referenzen, kein CSS-in-JS-Library-Wechsel.
- Änderungen möglichst lokal halten — beide Hauptdateien sind riesig, gezielte Edits statt große Refactors.
- Keine Logik duplizieren — z. B. Backend-`extractSummaryFromRaw` muss mit Frontend-`extractQuoteFromRaw` synchron bleiben.
- Bei UI-Arbeit: neue Strings immer durch `t()` (react-i18next), niemals hartcodierte DE/EN-Strings.
- **Production-Build vor Abschluss von Frontend-Changes verifizieren** (esbuild-TDZ-Risiko ist real, Dev-Mode reicht nicht).

### Für Webprojekte
- Bestehende Komponenten zuerst wiederverwenden (`RailBtn`, `SidebarTip`, `InfoTip`, `LabelTip`, `Modal`).
- Theme-Wechsel (`data-theme`) und Comfort-Mode (`zoom: 1.18`) bei jeder Positions-/Tooltip-Logik mitdenken.

---

## 9. Design- und Qualitätskriterien

### UX / UI
- Klare Hierarchie über Rail-Navigation
- Konsistenter visueller Rhythmus über CSS-Custom-Properties statt Hardcoded-Farben
- Tooltip-Positionierung muss in Pro-, Comfort- und Light/Dark-Mode korrekt bleiben

### Frontend
- Theme-fähig (CSS-Variablen, kein Re-Render für Theme-Wechsel nötig)
- Sticky/gepinnte Tabellenspalten müssen opake Backgrounds haben (kein Bleed-Through beim Scrollen)
- Production-Build-Check gegen TDZ-Fehler

### Codequalität
- Kleine Diff-Größe, wo möglich
- Kommentare nur dort, wo wirklich nötig (Projekt-Konvention: keine bis minimale Kommentare)

---

## 10. Offene Fragen

- Keine offenen Fragen zum aktuellen Zeitpunkt.

---

## 11. Übergabe an anderes Modell / anderes Tool

**Bisher verwendet in:**
- Claude Code (primäres Tool für diese Session-Reihe)

**Was das letzte Tool zuletzt gemacht hat:**
- Tooltip-Viewport-Fixes (Clamping, `side`-Prop, Portal für `SidebarTip`/`RailBtn`)
- "Move to Portfolio"-Feature im Transaktions-Edit-Modal (Backend `PUT /api/transactions/:id` + Frontend-State-Move)
- Sticky-Column-Overlap-Fix in der Transaktionstabelle (`--row-accent-bg`, `background: inherit`)
- Tooltip-Positionierungs-Fix für Comfort-Mode (`zoom: 1.18`-Korrektur in `_tipBubble`/`SidebarTip`/`RailBtn`)
- Docker-Timezone-Fix (`/etc/localtime`-Mount → `TZ`-Env-Var + `apk add tzdata`)
- Alle Änderungen via PRs #2–#5 nach `main` gemergt

**Welche Dateien geändert wurden:**
- `frontend/src/App.jsx`
- `backend/server.js`
- `backend/Dockerfile`
- `docker-compose.yml`
- `CLAUDE.md`

**Was als Nächstes erwartet wird:**
- Offen — abhängig vom nächsten Nutzer-Auftrag.

**Worauf besonders geachtet werden soll:**
- Production-Build (`docker compose build`) nach jeder `App.jsx`-Änderung laufen lassen, nicht nur Dev-Server.
- Bei Docker-Infra-Changes auf macOS: `/etc/localtime`-Bind-Mounts vermeiden (siehe Fix in PR #5).

---

## 12. Copy-Paste-Kurzbriefing

```md
Du übernimmst ein bestehendes Projekt: Portfolio Tracker (Portfolio-Pal).

Ziel des Projekts:
Selbst-gehosteter Portfolio-Tracker (Node/Express + SQLite Backend, React/Vite Frontend,
Docker Compose, zwei Container). Multi-Portfolio, Multi-Currency, Live-Kurse via Yahoo
Finance, DE/EN-i18n, Light/Dark-Theming, ETF-Screener, Analytics (Correlation/Monte-Carlo/
Rebalancing). Privacy-first, keine Cloud-Abhängigkeit.

Aktuelle Aufgabe:
Keine offene Aufgabe — letzter Stand ist stabil und nach main gemergt (PR #5).
Warte auf neue Anweisung vom Nutzer.

Wichtige Dateien / Source of Truth:
- CLAUDE.md (technische Source of Truth: Architektur, Caching, CSS-Designsystem)
- README.md (Produktbeschreibung, Features)
- backend/server.js (~2'600 Zeilen, einzige Backend-Datei)
- frontend/src/App.jsx (~9'200 Zeilen, einzige Haupt-UI-Datei)

Bereits entschieden:
- Kein TypeScript, keine Tests, kein Linter, kein CI/CD (bewusst).
- CSS-Designsystem: nur `rail-density-row`/`rail-density-btn` und `app-nav-tab` für Toggles/Nav.
- DB-Schema-Änderungen nur via `ALTER TABLE` direkt in server.js, keine externen Migrationsdateien.
- TZ über Env-Var setzen, nie `/etc/localtime`-Bind-Mount (macOS-Tzdata-Updates brechen das).

Bitte beachten:
- Bestehende Struktur respektieren, Banner-Grep (`// ════`) statt Volltext-Lesen der Riesendateien.
- Production-Build nach Frontend-Änderungen prüfen (esbuild-TDZ-Footgun, siehe CLAUDE.md).
- Vor Änderungen zuerst kurz den aktuellen Stand zusammenfassen.
```

---

## 13. Empfohlene Nutzung in deinem Workflow

### Wenn du in Claude Desktop startest
Nutze diese Vorlage als `project-brief.md`, damit spätere Sessions leichter fortgesetzt werden können.

### Wenn du in Zed oder Cursor weiterarbeitest
`CLAUDE.md` existiert bereits im Repo-Root und wird von Claude Code automatisch gelesen — für Zed/Cursor ggf. zusätzlich als `AGENTS.md` referenzieren.

### Wenn du mit Kimi oder GLM weitergehst
Kopiere vor allem die Abschnitte „Source of Truth“, „Aktueller Stand“, „Nächste Aufgabe“ und „Copy-Paste-Kurzbriefing“ in die neue Session.

---

## 14. Mini-Version für schnelle Übergaben

```md
Projekt: Portfolio Tracker (Portfolio-Pal)
Ziel: Self-hosted Multi-Currency Portfolio-Tracker mit Live-Kursen, i18n, Theming, ETF-Screener.
Stand: Stabil, alle Fixes bis PR #5 nach main gemergt. Keine offene Aufgabe.
Aktuelle Aufgabe: Wartet auf neue Nutzer-Anweisung.
Wichtige Dateien: CLAUDE.md, README.md, backend/server.js, frontend/src/App.jsx
Schon entschieden: Kein TS/Tests/CI, fixes CSS-Designsystem, TZ via Env-Var.
Nicht ändern: Bestehende CSS-Patterns, DB-Migrationsmuster.
Offene Frage: keine
```
