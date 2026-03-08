# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Unfairness** is a web game where a human plays the [ultimatum game](https://en.wikipedia.org/wiki/Ultimatum_game) against an AI (via OpenRouter) over 6 rounds. Each round, 10 points are split; if a proposal is rejected, both players get 0. Odd rounds: human proposes, AI decides. Even rounds: AI proposes, human decides. "Winning" means scoring >30 points or beating the AI by >10.

## Running Locally

Requires `backend/.env` with `OPENROUTER_API_KEY=...` (get from openrouter.ai).

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Mongo Express (DB admin): http://localhost:4001

## Architecture

**Three-tier + reverse proxy:**
- `nginx` (port 3004 in prod, proxied externally) routes `/api/*` and `/health` to the FastAPI backend, everything else to the React frontend
- `backend/` — FastAPI app (`main.py`), single file, runs with uvicorn
- `frontend/` — Create React App, single-component app (`src/App.js`), uses relative `/api` URLs (works because nginx proxies in both dev and prod)
- `mongodb` — stores game state; `mongo-express` for local admin UI

**Backend (`backend/main.py`):**
- `MongoGameStore` wraps pymongo; uses MongoDB ObjectId as session ID (`_id` and `session_id` are the same value)
- `GameState` / `GameMessage` are Python dataclasses stored as MongoDB documents
- `call_openrouter_api()` calls `anthropic/claude-4-sonnet-20250522` via OpenRouter with 30s timeout
- Two AI prompts: `get_ai_decision_prompt()` and `get_ai_proposal_prompt()` — AI responds in strict `DECISION: ACCEPT/REJECT` or `PROPOSAL: <number>` formats
- **Debug mode**: activated by Shift+Ctrl/Cmd click on the "Make Proposal" button; AI auto-accepts all proposals and gives all points, games flagged `debug_mode: true` are excluded from the leaderboard
- Leaderboard excludes `debug_mode: true` games and games without player names; sorts by human score or score-difference, with message character count as tiebreaker (fewer chars = better rank)

**Frontend (`frontend/src/App.js`):**
- Single `App` component managing all state; no routing, no state management library
- `getCurrentPhase()` determines current UI state from `gameState.messages` and `gameState.current_round`
- After human submits proposal/decision, if AI needs to propose next round, a `setTimeout(() => aiPropose(), 1000)` triggers the AI proposal call
- Player name saved in `localStorage` under key `unfairness_player_name`; name dialog shown on win (human_score > 30 or difference > 10) if no name set
- Model name displayed by stripping `anthropic/` prefix from `gameState.model_name`
- `X-Real-IP` header forwarding is commented out in nginx.conf; backend reads `x-real-ip` header for IP logging

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/new-game` | Start session, returns `session_id` |
| GET | `/api/game/{session_id}` | Get full game state |
| POST | `/api/propose` | Human proposes split; AI decides synchronously |
| POST | `/api/decide` | Human accepts/rejects AI proposal |
| POST | `/api/ai-propose/{session_id}` | Trigger AI to make a proposal |
| PATCH | `/api/game/{session_id}` | Update player name |
| GET | `/api/leaderboard` | Paginated leaderboard (`sort_by`, `page`, `page_size` params) |
