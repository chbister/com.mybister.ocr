SHELL := /bin/bash

up:
	set -a; source .env; set +a; \
	docker compose pull ocr 2>/dev/null || true; \
	docker compose up -d --scale ocr=$$OCR_REPLICAS

pull:
	docker compose pull

build:
	docker compose build

down:
	docker compose down

