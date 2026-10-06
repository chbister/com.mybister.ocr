# com.mybister.ocr

Asynchroner PDF-OCR-Microservice (Node.js + Express, Tesseract, Poppler, Ghostscript).

Ein PDF wird per `POST /ocr` hochgeladen, im Hintergrund verarbeitet
(Rotation korrigieren → Text prüfen → ggf. OCR → optimieren) und das
Ergebnis als Multipart-POST an eine `callbackUrl` zugestellt.

## Ablauf

1. `POST /ocr` mit Multipart-Feld `file` (PDF) und Feld `callbackUrl`.
   Antwort sofort: `202 { message, id, hostname }`.
2. Pipeline pro Job (`temp/`):
   - Rotation per `pdfinfo` prüfen, ggf. per Ghostscript korrigieren
   - Seite 1 als PNG-Vorschau rendern (`pdftoppm`)
   - `smartPDFProcess`: enthält das PDF bereits ≥ 50 alphanumerische
     Zeichen (`pdftotext`), wird die OCR übersprungen, sonst Voll-OCR
     mit Tesseract (`deu+eng`) als durchsuchbares PDF + `.txt`
   - PDF optimieren (`Ghostscript /ebook`), Seite 1 als eigenes PDF extrahieren
3. Erfolgs-Callback als `multipart/form-data` an `callbackUrl`:
   `id`, `text`, `filename`, `pdf` (optimiert), `pdf_page1`, `image` (PNG).
   Schlägt nur die Zustellung fehl, wird das **nicht** als OCR-Fehler gemeldet.
4. Bei OCR-Fehler: JSON-Callback `{ id, error: "OCR failed", message, filename }`.
5. `temp/`-Cleanup läuft immer (`finally`): alle Job-Artefakte (`<id>*`)
   plus Upload werden gelöscht; verwaiste Dateien älter als
   `TEMP_MAX_AGE_HOURS` werden beim Start und stündlich entfernt.

## API

| Methode | Pfad | Beschreibung |
| ------- | ---- | ------------ |
| `GET` | `/` | Healthcheck (`OCR microservice running on <host>`) |
| `POST` | `/ocr` | Multipart-Upload: `file` (PDF, Pflicht), `callbackUrl` (http/https). Ohne Datei → `400`. Max. Body via Nginx: `48M`. |

Beispiel:

```bash
curl -X POST http://localhost:3000/ocr \
  -F "file=@rechnung.pdf" \
  -F "callbackUrl=https://mein-backend.example/ocr-callback"
# → {"message":"OCR started","id":"…","hostname":"…"}
```

## Konfiguration (`.env`)

Siehe `.env.example`:

| Variable | Default | Beschreibung |
| -------- | ------- | ------------ |
| `OCR_REPLICAS` | – | Anzahl OCR-Container bei `make up` (`--scale ocr=…`) |
| `OCR_IMAGE` | `ghcr.io/chbister/com.mybister.ocr:latest` | Zu deployendes Image (z. B. `sha-<short>` pinnen) |
| `TEMP_MAX_AGE_HOURS` | `24` | Alter, ab dem verwaiste `temp/`-Dateien gelöscht werden |
| `CALLBACK_TIMEOUT_MS` | `30000` | Timeout für Callback-POSTs |

## Paket (GHCR)

Das Image wird automatisch gebaut und bereitgestellt:

- Registry: `ghcr.io/chbister/com.mybister.ocr`
- Trigger (`.github/workflows/docker-publish.yml`):
  PR auf `main` = nur Build, Push auf `main` / Tags `v*.*.*` / manuell = Build + Push
- Tags: `latest` (nur `main`), `main`, `sha-<short>`, Tag-Name bei Releases

```bash
docker pull ghcr.io/chbister/com.mybister.ocr:latest
OCR_IMAGE=ghcr.io/chbister/com.mybister.ocr:sha-a781e46 make up
```

Hinweis: Das GHCR-Package steht default ggf. auf privat und muss
einmalig auf **public** gestellt werden
(Repo → Packages → `com.mybister.ocr` → Package settings → Change visibility).

## Betrieb

Voraussetzungen: Docker + externes Netz `proxy-network`
(`docker network create proxy-network`), Verzeichnis `_uploads/`
wird nach `/app/temp` gemountet. Nginx (`ocr-lb`, `least_conn`)
terminiert auf Port 3000 mit `client_max_body_size 48M`.

```bash
cp .env.example .env   # anpassen
make up                # pullt Image, startet skaliert
make pull              # nur Images ziehen
make build             # lokal bauen
make down
```

## Entwicklung

- `main` ist geschützt: keine Direkt-Pushes, Änderungen nur per
  Feature-Branch → Pull Request → Merge; CI-Job `build` muss grün sein.
- Lokal: `npm ci && npm start` (Node ≥ 20; Systemtools:
  `poppler-utils`, `tesseract-ocr` + `deu`/`eng`, `ghostscript`, `imagemagick`).
- Quellcode: `server.js` (API, Callback, Cleanup),
  `utils/ocr.js` (Rotation, Rendern, Smart-OCR, Optimierung).
