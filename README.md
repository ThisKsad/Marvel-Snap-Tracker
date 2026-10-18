# Marvel Snap Tracker

Eigener Tracker für Marvel-Snap-Spiele: Match-Historie, Siegraten pro Deck, pro Karte und gegen Gegner-Decks.

- **Website:** https://thisksad.github.io/Marvel-Snap-Tracker/ (am Handy und am PC)
- **PC-Programm:** erfasst jedes Spiel am PC automatisch
- **Handy-Spiele:** auf der Website über „+ Spiel“ eintragen

## PIN

Die Website und das PC-Programm sind mit einem PIN geschützt. Die Datenbank prüft ihn selbst, ohne PIN
lassen sich keine Spiele lesen, eintragen oder löschen. Nach 10 falschen Versuchen in 10 Minuten ist für
10 Minuten gesperrt.

Beim ersten Öffnen der Website legst du den PIN fest. Ändern kannst du ihn unten auf der Seite über „PIN ändern“
(danach `Installieren.bat` erneut ausführen, damit das PC-Programm den neuen PIN kennt).

## PC-Programm installieren

0. Zuerst auf der Website den PIN festlegen.
1. Den Ordner `pc` herunterladen (oder das ganze Repo als ZIP: grüner Button „Code“ → „Download ZIP“) und entpacken.
2. `Installieren.bat` doppelklicken und den PIN eingeben. Er wird verschlüsselt gespeichert, nur dein Windows-Benutzer kann ihn lesen.

Danach läuft der Tracker im Hintergrund (lila „S“ unten rechts in der Taskleiste) und startet automatisch mit Windows.
Nach jedem Spiel erscheint kurz eine Meldung mit Ergebnis und Cubes. Rechtsklick auf das Symbol: Tracker öffnen, Log anzeigen, Beenden.

Entfernen: `Deinstallieren.bat` doppelklicken. Die gespeicherten Spiele bleiben erhalten.

### Wie es funktioniert

Marvel Snap schreibt nach jeder Partie die Datei
`%USERPROFILE%\AppData\LocalLow\Second Dinner\SNAP\Standalone\States\nvprod\GameState.json`.
Das Programm prüft sie alle 5 Sekunden. Ist eine neue, beendete Partie drin, schickt es die Datei an die
Supabase-Funktion `snap_ingest`, die Ergebnis, Cubes, Deck, gezogene und gespielte Karten, Gegnerkarten und
Locations herausliest und in der Tabelle `snap_matches` speichert. Bereits gesendete Spiele merkt es sich in
`%LOCALAPPDATA%\SnapTracker\gesendet.txt`.

Das Programm liest nur diese Datei und verändert am Spiel nichts.

## Technik

- `index.html`, `style.css`, `app.js`, `cards.js`: statische Website (GitHub Pages)
- `pc/`: PowerShell-Programm (Windows PowerShell 5.1, keine Installation nötig)
- `supabase/schema.sql`: Tabelle `snap_matches` und Auswertung der Spieldatei im Supabase-Projekt „Ultimate Hunt“
- `supabase/002_pin.sql`: PIN-Schutz, alle Zugriffe laufen über PIN-geprüfte Funktionen
