# Watch-Shop

Demo-Shop der fiktiven Uhrenmarke **Orvane** mit der Meridian als 3D-Modell (three.js): ruhige Shopseite mit Produktbildern aus dem 3D-Modell, Konfigurator, Warenkorb ohne Zahlung, Modell-Verlauf, Logo-Entwürfe, Hell- und Dunkelmodus sowie Offline-Betrieb als PWA.

**Website (GitHub Pages):** [https://n-brand.github.io/Watch-Shop/](https://n-brand.github.io/Watch-Shop/)

## Lokal starten

Benötigt nur Node.js, keine Installation von Paketen:

```bash
node server.js
```

Danach im Browser öffnen: [http://127.0.0.1:5173](http://127.0.0.1:5173)

## Seiten

- `index.html` – Shop mit Produktbildern, Story, Details und Konfigurator (kein 3D, keine Scroll-Effekte)
- `history.html` – Modell-Verlauf aller gespeicherten Uhrenversionen (glb) mit drehbarer 3D-Detailansicht, auf dem Handy als Vollbild mit Pfeilen
- `logos.html` – Entwürfe des Orvane-Kristalls in 2D und 3D

## Aufbau

- `js/watch/` – die Uhr aus Code (Gehäuse, Zifferblatt, Zeiger, Armband, Materialien)
- `js/logo/` – der Orvane-Kristall als 3D-Facetten (SVG-Logo und 3D-Modell aus derselben Definition)
- `js/scene.js`, `js/studio.js` – 3D-Ansicht, Studio-Licht, Kamera (Verlauf und Render-Werkzeug)
- `assets/img/renders/` – Produktbilder der Uhr (WebP, transparenter Hintergrund)
- `assets/models/history/` – gespeicherte Versionen (`vNNN.glb`, Vorschaubilder, `index.json`)
- `server.js` – kleiner lokaler Server; speichert neue Versionen über `/api/versions`
- `sw.js`, `manifest.webmanifest`, `assets/icons/` – PWA / Offline
- `tools/` – Hilfsskripte (Platzhalterbilder, App-Icons) und `render-stills.html`: rendert die Produktbilder neu, wenn sich die Uhr ändert (lokal unter http://127.0.0.1:5173/tools/render-stills.html, speichert über `/api/renders`)

## Hinweise

- Alle Bilder sind Platzhalter, Marke und Logo sind frei erfunden.
- Auf GitHub Pages läuft die Seite statisch: Das Speichern neuer Versionen im Verlauf funktioniert nur lokal mit `server.js`.
- three.js (nur Verlauf und Logo-Seite) und Schriften (Google Fonts) werden von CDNs geladen.
