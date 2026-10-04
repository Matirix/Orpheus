set shell := ["bash", "-c"]

host:
	bash scripts/host.sh

dev:
	cd frontend && npm run dev & cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000; wait

test:
	@echo "=== Frontend tests ===" && cd frontend && npx vitest run
	@echo "=== Backend tests ===" && uv run python -m pytest backend/tests -v

lint:
	@echo "=== Frontend lint ===" && cd frontend && npx eslint . --ext ts,tsx 2>&1 | tail -5
	@echo "=== Backend lint ===" && cd /home/malefor/Projects/piano-detect && uvx ruff check backend 2>&1 | tail -2
	@echo "=== Formatting check ===" && cd /home/malefor/Projects/piano-detect && uvx ruff format --check backend 2>&1 | tail -1

build:
	cd frontend && npm run build
