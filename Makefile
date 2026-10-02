.PHONY: dev test lint build

dev:
	@cd frontend && npm run dev & cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000; wait

test:
	@echo "=== Frontend tests ==="
	@cd frontend && npx vitest run
	@echo "=== Backend tests ==="
	@cd /home/malefor/Projects/piano-detect && python -m pytest backend/tests -v

lint:
	@echo "=== Frontend ==="
	@cd frontend && npx eslint . --ext ts,tsx
	@echo "=== Backend ==="
	@cd /home/malefor/Projects/piano-detect && uvx ruff check backend
	@cd /home/malefor/Projects/piano-detect && uvx ruff format --check backend

build:
	@cd frontend && npm run build
