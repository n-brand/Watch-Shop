# Watch-Shop

Demo-Shop der fiktiven Uhrenmarke **Orvane** mit der Meridian als 3D-Modell (three.js): ruhige Shopseite mit Produktbildern aus dem 3D-Modell, Konfigurator, Warenkorb ohne Zahlung, Modell-Verlauf, Logo-Entwürfe, Hell- und Dunkelmodus sowie Offline-Betrieb als PWA.

**Website (GitHub Pages):** [https://n-brand.github.io/Watch-Shop/](https://n-brand.github.io/Watch-Shop/)

Erstellt von [Nicolas Brand](https://n-brand.github.io/portfolio/)

## Lokal starten

Benötigt nur Node.js, keine Installation von Paketen:

```bash
node server.js
```

Danach im Browser öffnen: [http://127.0.0.1:5173](http://127.0.0.1:5173)

## Seiten

- `index.html` – Shop mit Produktbildern, Story, Details und Konfigurator; im Konfigurator Modell per Dropdown wählen (Meridian, Lumen) und die Uhr in 3D drehen (three.js lädt erst, wenn der Konfigurator in Sicht kommt)
- `tests.html` – interne Experimente, z. B. das Lumen-Display nur mit HTML/CSS
- `history.html` – Modell-Verlauf aller gespeicherten Uhrenversionen (glb) mit drehbarer 3D-Detailansicht, Filter nach Modell (Meridian, Lumen), auf dem Handy als Vollbild mit Pfeilen
- `logos.html` – Entwürfe des Orvane-Kristalls in 2D und 3D

## Aufbau

- `js/watch/` – die Uhren aus Code: Meridian (analog: Gehäuse, Zifferblatt, Zeiger, Armband, Materialien) und Lumen (digital: Kissengehäuse, 7-Segment-Display mit Live-Uhrzeit, gleiches Armband)
- `js/logo/` – der Orvane-Kristall als 3D-Facetten (SVG-Logo und 3D-Modell aus derselben Definition)
- `js/scene.js`, `js/studio.js` – 3D-Ansicht, Studio-Licht, Kamera (Verlauf und Render-Werkzeug)
- `assets/img/renders/` – Produktbilder der Uhren (WebP, transparenter Hintergrund), pro Modell, Gehäuse und Armband
- `assets/models/history/` – gespeicherte Versionen (`vNNN.glb`, Vorschaubilder, `index.json`)
- `server.js` – kleiner lokaler Server; speichert neue Versionen über `/api/versions`
- `sw.js`, `manifest.webmanifest`, `assets/icons/` – PWA / Offline
- `tools/` – Hilfsskripte (Platzhalterbilder, App-Icons) und `render-stills.html`: rendert die Produktbilder neu, wenn sich die Uhr ändert (lokal unter http://127.0.0.1:5173/tools/render-stills.html, speichert über `/api/renders`)
- `tools/save-version.html` – Modell wählen, in 3D ansehen und als nächste Version im Verlauf speichern (lokal unter http://127.0.0.1:5173/tools/save-version.html)

## Hinweise

- Alle Bilder sind Platzhalter, Marke und Logo sind frei erfunden.
- Auf GitHub Pages läuft die Seite statisch: Das Speichern neuer Versionen im Verlauf funktioniert nur lokal mit `server.js`.
- three.js (nur Verlauf und Logo-Seite) und Schriften (Google Fonts) werden von CDNs geladen.
