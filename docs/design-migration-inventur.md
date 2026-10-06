# Design-Migration FinTools → Pal-Designsystem (Inventur)

Stand: 2026-10-06 · Quelle: Trade-Pal-Designsystem (Figma „Trade-Pal“, Seite „Design System“)

Ziel: Typografie, Weißraum, Raumausnutzung und Modularität von Trade-Pal
übernehmen. **Beibehalten:** Rail-Navigation am linken Rand, Nutzer-/Settings-
Popup als kleines Overlay, Grün/Rot für Gewinn/Verlust, Pro-/Comfort-Modus.
**Entschieden:** Schriften werden getauscht.

## 1. Ausgangslage

| Kennzahl | App.jsx | Analytics.jsx |
| --- | --- | --- |
| Zeilen | 9 978 | 2 847 |
| Inline-Styles (`style={{…}}`) | 972 | 354 |
| `rgba(…)`-Literale | 299 | 70 |
| `fontWeight` 700/800 | 127 | 70 |
| `boxShadow` | 21 | 5 |
| häufigste Radien | 8, 10, 50 %, 5, 9, 12 px | 6, 8, 2 px |
| häufigste Schriftgrößen | 11, 10, 9, 12, 13 px | 10, 9, 11 px |

Gute Nachricht: Alle Farben und Schriften laufen über CSS-Variablen
(`useGlobalStyles()`, Objekt `THEME`), Hell/Dunkel per `data-theme`. Ein
Token-Tausch wirkt sofort app-weit. Aufwändig sind die Inline-Styles: Radien,
Schatten, fette Gewichte und `rgba`-Literale stecken direkt in den Komponenten.

## 2. Token-Mapping (Namen bleiben, Werte wechseln)

| FinTools-Variable | Pal-Token | Hell | Dunkel |
| --- | --- | --- | --- |
| `--bg` | `ui/bg` | `#f5f3ee` | `#141312` |
| `--surface` | `ui/panel` | `#ffffff` | `#1c1b18` |
| `--surface-2` | `ui/hover-2` | `#faf9f6` | `#211f1b` |
| `--border` | `ui/line` | `#e5e2d9` | `#32302a` |
| `--border-2` | `ui/line-2` | `#efede6` | `#28261f` |
| `--fg-1` | `ui/ink` | `#0b0b0c` | `#ece9e2` |
| `--fg-2` | `ui/ink-2` | `#6f6d66` | `#a8a59c` |
| `--fg-3` | `ui/ink-3` | `#a8a59c` | `#6f6d66` |
| `--accent` | `signal/up` (Auswahl, Links, Fokus) | `#2563eb` | `#2563eb` |
| `--accent-08/15/35` | Tönung von `signal/up` | 8/15/35 % | 8/15/35 % |
| `--green` | **bleibt** Grün (Gewinn) | `#16a34a` | `#4ade80` |
| `--red` | `signal/down` (Verlust) | `#dc2626` | `#f87171` |
| `--yellow` | `horizon/8h` (Amber) | `#d97706` | `#fbbf24` |
| `--row-accent-bg` | deckende Blau-Tönung | `#edf2fe` | `#1d2129` |
| `--shadow-card` | **entfällt** (Haarlinien statt Kartenschatten) | `none` | `none` |
| `--shadow-modal` | `Schatten/Popover` | `0 12px 32px rgba(0,0,0,.18)` | `0 12px 32px rgba(0,0,0,.6)` |
| `--font-sans` | Fira Sans (beide Themes, heute Syne im Dunkelmodus) | | |
| `--font-mono` | Fira Code (statt JetBrains Mono) | | |
| `--font-serif` | Instrument Serif (statt DM Serif Display) | | |
| neu `--radius-0/2/12` | `radius/*` | 0 · 2 · 12 px | |
| neu `--dot` | `ui/dot` (Punktraster-Hintergrund) | `#e8e5db` | `#262420` |
| neu `--green-tint`, `--red-tint` | Zellen-Tönung wie `signal/*-tint` | 10 % / 9 % | 18 % / 16 % |

Schriften als woff2 aus `trade-pal/app/static/vendor/` selbst ausliefern statt
über Google Fonts zu laden (eine externe Anfrage weniger, DSGVO-freundlicher).
`--fs-base: 13px` passt bereits zur Pal-Grundgröße (`Text/Standard`).
`PORTFOLIO_COLORS` bleibt als Daten-Palette; Kandidat für spätere Angleichung an
`horizon/*` und `region/*`.

## 3. Komponenten-Inventur

Legende: **übernehmen** = Pal-Komponente existiert und passt direkt ·
**ableiten** = FinTools-Element bleibt, bekommt Pal-Regeln ·
**Lücke** = neue Pal-Komponente nötig (erst in Figma, dann im Code).

### Navigation und Overlays (Struktur bleibt)

| FinTools | Pal-Vorbild | Status | Änderung |
| --- | --- | --- | --- |
| `Rail` (52/224 px), `EtfRail` | Kachel-Kopf, Haarlinien | **Lücke** „Rail“ | Fläche `panel`, Haarlinie rechts, kein Radius, Sektionstitel als Versal-Label |
| `RailBtn` (`.rail-btn`, Radius 6, blaue Fläche aktiv) | Button | **Lücke** „Rail-Button“ | quadratisch, aktiv = 2-px-Balken `ink` links + Text `ink` 500, Hover `hover-2`, Icon `ink-2` 1,5 px Strich |
| `RailSection`, `Divider` | Label/Kennzahl, `line-2` | ableiten | Versal 9 px, Laufweite 1,3 px |
| `.rail-user`, `.avatar` (Radius 8) | Badge | **Lücke** „Avatar“ | Radius 2, Initialen in Fira Code |
| `UserModal` (Popup 240 px, Radius 12) | Instrument-Popover | ableiten | bleibt Radius 12 + `Schatten/Popover`; Kopf `hover-2` mit Nutzername in Fira Code, Abschnitte mit `line-2`, Zeilen `Text/12`, Logout-Bestätigung als Button „Gefahr“ |
| `SidebarTip`, `.rail-tip` | Tooltip | **Lücke** Variante „Tooltip kurz“ | einzeilig, gleicher Rahmen wie Pal-Tooltip |
| `.app-nav-tab` (Radius 9, Fett 700 aktiv) | Button-Gruppe | **Lücke** „Tab“ | kein Radius, aktiv = `ink` + 2-px-Unterlinie, Gewicht 500 |
| `.rail-density-row/-btn` (Segment, Radius 8/6) | Button-Gruppe mit −1 px Überlappung | **Lücke** „Segment-Schalter“ | aktiv = Fläche `ink`, Text `panel` (wie Button „Primär“) |

### Dialoge und Formulare

| FinTools | Pal-Vorbild | Status | Änderung |
| --- | --- | --- | --- |
| `Modal` (Radius 18, Padding 28, Blur) | Kachel-Kopf + Popover-Rahmen | **Lücke** „Dialog“ | Radius 12, `Schatten/Popover`, Kopf = Kachel-Kopf (Titel dünn, klein), Inhalt 12–16 px Innenabstand |
| `SettingsModal`, `AccountSettings` | Einstellungsseite | ableiten | Formularzeilen wie Trade-Pal-Settings; Statuszeilen in Fira Code (ok/Fehler/läuft) |
| `AddTxModal`, `AddPortfolioModal`, `RenamePortfolioModal`, `EditPlanModal`, `ImportExportModal`, `SaveEtfModal`, `DeleteEtfModal`, `EmailReminderModal` | Dialog | ableiten | alle über den neuen Dialog |
| `DeleteConfirmOverlay` | Dialog + Button „Gefahr“ | ableiten | |
| `FLabel`, `FInput`, `FSelect` | Eingabefeld, Auswahl, Label/Tabellenkopf | übernehmen | Label in Versalien 10 px |
| `LoginScreen` | Eingabefeld, Button | **Lücke** „Login-Karte“ | Seitenkomposition fehlt in Pal |
| `RefreshIconButton` | Button | **Lücke** „Icon-Button“ | 31 × 31, Rahmen `line`, kein Radius |

### Inhalte und Daten

| FinTools | Pal-Vorbild | Status | Änderung |
| --- | --- | --- | --- |
| `SummaryBar`, `EtfSummaryBar` | KPI-Kachel | übernehmen | Werte `Display/Kennzahl`, Labels Versal 9 px, gepunktete Linie = Tooltip |
| `PeriodToolbar`, `ViewModeToggle` | Segment-Schalter | ableiten | |
| `TreeMapView`, `ConsolidatedTreeMap` | Market Map | übernehmen | Gruppentitel Versal 10 px, Zellen Fira Code |
| `BarChartView`, `SplitBarChartView`, `PerformanceView`, Analytics | Diagramm-Konventionen | ableiten | Achsen Fira Code 10 `ink-3`, Gitter `gridln`, Linien 1,4–1,6 px, große Einzelwerte `Display/Kurs groß` (Serif) |
| `Tooltip` (Diagramm) | Instrument-Popover | übernehmen | |
| `InfoTip`, `LabelTip`, `_tipBubble` | Tooltip | übernehmen | Positionslogik (Clamping, `side`) bleibt, nur die Haut wechselt |
| `TransactionList`, `SplitTransactionList`, `EtfHoldingsTable` | Tabelle (th Versal, td Fira Code) | ableiten | fixierte Spalten und deckende Zeilen bleiben |
| Gewinn/Verlust-Zellen | Heatmap-Zelle | ableiten | Varianten Gewinn (Grün-Tönung) / Verlust (Rot-Tönung) |
| `HoldingSparkline` | Sparkline | übernehmen | Grün/Rot statt Blau/Rot |
| `SavingsPlansSection`, `HistoricCoursesView` | Kachel (Kachel-Kopf + Inhalt) | ableiten | |
| `.tab-pill`, `--toggle-*`-Pillen | Badge | ableiten | Radius 2, Fira Code 10 Versal |
| Flaggen (`react-circle-flags`) | – | bleibt | |
| `.spin`, `.pulse` | – | bleibt | |

### Lücken (neu in Figma anlegen, dann in den Code)

1. Rail und Rail-Button
2. Avatar
3. Tab
4. Segment-Schalter
5. Dialog (inkl. Bestätigungsvariante)
6. Icon-Button
7. Tooltip kurz
8. Login-Karte
9. Gewinn/Verlust-Zelle (Variante der Heatmap-Zelle)
10. Leerzustand und Ladeanzeige (heute verstreut als Inline-Styles)

## 4. Regeln, die aus Trade-Pal übernommen werden

- Kein Radius auf Flächen (max. 2 px). Radius 12 + Schatten **nur** für Overlays (Popover, Popup, Dialog, Tooltip).
- Kacheln stoßen bündig aneinander, getrennt durch 1-px-Haarlinien; keine schwebenden Karten mit Schatten.
- Kachelkopf 42 px: Griff, Titel Fira Sans 200 / 16 px klein geschrieben, Untertitel 10 px `ink-3`, ⓘ, Einklappen.
- Labels in Versalien 9–10 px mit Laufweite; Zahlen immer Fira Code mit Tabellenziffern.
- Serif nur für große Einzelwerte (Kurs, Portfoliowert, Seitentitel).
- Gewichte leicht halten: Titel 200, Bedienelemente 500, Hervorhebung 600. 700/800 nur für die Wortmarke.
- Innenabstand 12 px, Abstände aus `space/*`.
- Aktiver Zustand = `ink` (Fläche oder Linie), Blau nur für Auswahl, Links und Fokus.

## 5. Umstellungsplan

1. **Tokens und Schriften** (ein Commit): Werte in `useGlobalStyles()` tauschen, Schriften selbst hosten, `--shadow-card: none`, Radius-Tokens anlegen.
2. **Globale Klassen**: `.panel`, `.p-head`, `.label`, `.num`, `.btn`, `.seg`, `.tab` in `useGlobalStyles()`; `.rail-*`, `.app-nav-tab`, `.rail-density-*` auf Pal-Regeln umstellen.
3. **Rail, Nutzer-Popup, Tooltips**: Haut tauschen, Props und Verhalten unverändert.
4. **Dialog**: `Modal` umbauen, damit erben alle Dialoge.
5. **Ansichten nacheinander**: SummaryBar → Treemap → Transaktionen → Performance → ETF-Explorer → Analytics. Inline-Styles nur dort durch Klassen ersetzen, wo ohnehin gearbeitet wird.
6. Nach jedem Schritt Screenshot-Vergleich hell/dunkel, Pro/Comfort.

## 6. Entscheidungen (2026-10-06)

- **Standard-Theme:** Dunkel bleibt Standard.
- **Aktiver Zustand:** `ink` (Fläche oder Linie); Blau nur für Auswahl, Links, Fokus.
- **Dichte:** Beide Modi bleiben (Pro = kompakt, Comfort = WCAG-Skalierung).
- **Figma:** Kopie des Designsystems in die FinTools-Datei
  (https://www.figma.com/design/vRWO5KbA2pNPOamvTywl6l/Fintools), keine Bibliothek.

## 7. Stand

- [x] Schritt 1: Tokens und Schriften (Branch `feat/pal-design`)
- [x] Figma: Designsystem in der FinTools-Datei, Seite „Design System“
  (Variablen Dunkel/Hell und Pro/Comfort, 22 Textstile, Schatten/Overlay,
  Komponenten inkl. aller 10 Lücken: Rail, Rail-Button, Avatar, Tab,
  Segment/Segment-Schalter, Dialog, Icon-Button, Rail-Hinweis, Login-Karte,
  Wert-Zelle, Leerzustand, Ladeanzeige; dazu Nutzer-Popup und Instrument-Popover)
- [ ] Schritt 2: globale Klassen; neue Variablen `--hover`, `--brand`, `--overlay` im Code ergänzen
- [ ] Schritt 3: Rail, Nutzer-Popup, Tooltips
- [ ] Schritt 4: Dialog
- [ ] Schritt 5: Ansichten
