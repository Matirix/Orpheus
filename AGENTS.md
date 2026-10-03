# AGENTS.md

## Commands

### Frontend
- `cd frontend && npm run dev` - Start dev server
- `cd frontend && npm run test` - Run tests
- `cd frontend && npm run lint` - Lint code
- `cd frontend && npm run typecheck` - Type check
- `cd frontend && npm run build` - Build for production

### Backend
- `cd /home/malefor/Projects/piano-detect && uv run python -m pytest backend/tests -v` - Run tests
- `cd /home/malefor/Projects/piano-detect && uvx ruff check backend` - Lint
- `cd /home/malefor/Projects/piano-detect && uvx ruff format backend` - Format

### All
- `just dev` or `make dev` - Run both frontend and backend in dev mode
- `just test` or `make test` - Run all tests
- `just lint` or `make lint` - Run all linting
- `just build` or `make build` - Build frontend

## Architecture Notes

- Real-time code (capture, detection, rendering, playback) must be plain TypeScript classes driven by `requestAnimationFrame`. Do not put per-frame data in React state. React is only for controls and status text.
- Backend models (torch, librosa, etc.) are imported lazily inside functions.
- Tests must run without the `ml` group.
- Preserve legacy/ until final parity checklist is done.
