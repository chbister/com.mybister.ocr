# com.mybister.ocr

Asynchronous PDF OCR microservice (Node.js + Express, Tesseract, Poppler, Ghostscript).

A PDF is uploaded via `POST /ocr`, processed in the background
(fix rotation → check text → OCR if needed → optimize), and the result
is delivered as a multipart POST to a `callbackUrl`.

## Workflow

1. `POST /ocr` with multipart field `file` (PDF) and field `callbackUrl`.
   Immediate response: `202 { message, id, hostname }`.
2. Per-job pipeline (`temp/`):
   - Check rotation via `pdfinfo`, correct it with Ghostscript if needed
   - Render page 1 as PNG preview (`pdftoppm`)
   - `smartPDFProcess`: if the PDF already contains ≥ 50 alphanumeric
     characters (`pdftotext`), OCR is skipped; otherwise full OCR
     with Tesseract (`deu+eng`) producing a searchable PDF + `.txt`
   - Optimize the PDF (`Ghostscript /ebook`), extract page 1 as its own PDF
3. Success callback as `multipart/form-data` to `callbackUrl`:
   `id`, `text`, `filename`, `pdf` (optimized), `pdf_page1`, `image` (PNG).
   If only the delivery fails, it is **not** reported as an OCR error.
4. On OCR failure: JSON callback `{ id, error: "OCR failed", message, filename }`.
5. `temp/` cleanup always runs (`finally`): all job artifacts (`<id>*`)
   plus the upload are deleted; orphaned files older than
   `TEMP_MAX_AGE_HOURS` are removed on startup and hourly.

## API

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/` | Health check (`OCR microservice running on <host>`) |
| `POST` | `/ocr` | Multipart upload: `file` (PDF, required), `callbackUrl` (http/https). No file → `400`. Max body via nginx: `48M`. |

Example:

```bash
curl -X POST http://localhost:3000/ocr \
  -F "file=@invoice.pdf" \
  -F "callbackUrl=https://my-backend.example/ocr-callback"
# → {"message":"OCR started","id":"…","hostname":"…"}
```

## Configuration (`.env`)

See `.env.example`:

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `OCR_REPLICAS` | – | Number of OCR containers for `make up` (`--scale ocr=…`) |
| `OCR_IMAGE` | `ghcr.io/chbister/com.mybister.ocr:latest` | Image to deploy (e.g. pin `sha-<short>`) |
| `TEMP_MAX_AGE_HOURS` | `24` | Age after which orphaned `temp/` files are deleted |
| `CALLBACK_TIMEOUT_MS` | `30000` | Timeout for callback POSTs |

## Package (GHCR)

The image is built and published automatically:

- Registry: `ghcr.io/chbister/com.mybister.ocr`
- Triggers (`.github/workflows/docker-publish.yml`):
  PR to `main` = build only, push to `main` / tags `v*.*.*` / manual = build + push
- Tags: `latest` (`main` only), `main`, `sha-<short>`, tag name for releases

```bash
docker pull ghcr.io/chbister/com.mybister.ocr:latest
OCR_IMAGE=ghcr.io/chbister/com.mybister.ocr:sha-a781e46 make up
```

Note: the GHCR package defaults to private and must be switched to
**public** once
(repo → Packages → `com.mybister.ocr` → Package settings → Change visibility).

## Operations

Prerequisites: Docker + external network `proxy-network`
(`docker network create proxy-network`); the `_uploads/` directory
is mounted to `/app/temp`. Nginx (`ocr-lb`, `least_conn`)
listens on port 3000 with `client_max_body_size 48M`.

```bash
cp .env.example .env   # adjust
make up                # pulls image, starts scaled
make pull              # pull images only
make build             # build locally
make down
```

## Development

- `main` is protected: no direct pushes, changes only via
  feature branch → pull request → merge; the CI `build` job must be green.
- Locally: `npm ci && npm start` (Node ≥ 20; system tools:
  `poppler-utils`, `tesseract-ocr` + `deu`/`eng`, `ghostscript`, `imagemagick`).
- Source: `server.js` (API, callback, cleanup),
  `utils/ocr.js` (rotation, rendering, smart OCR, optimization).
