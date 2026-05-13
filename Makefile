SHELL := /bin/bash

up:
	set -a; source .env; set +a; \
	docker compose up -d --scale ocr=$$OCR_REPLICAS

down:
	docker compose down

