SHELL := /bin/bash

# Image-Name aus der .env (Fallback: GHCR latest)
IMAGE := $(shell sed -n 's/^OCR_IMAGE=//p' .env 2>/dev/null)
ifeq ($(IMAGE),)
IMAGE := ghcr.io/chbister/com.mybister.ocr:latest
endif

up:
	set -a; source .env; set +a; \
	docker compose pull ocr; \
	docker compose up -d --scale ocr=$$OCR_REPLICAS

pull:
	docker compose pull

# Nur für die lokale Entwicklung: baut das Image direkt (ohne compose build).
build:
	docker build -t $(IMAGE) .

down:
	docker compose down

