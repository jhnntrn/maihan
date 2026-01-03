# Events API (FastAPI)

A lightweight API to store events with pictures. Uses SQLite by default.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

- `GET /events` – list events (sorted by time)
- `POST /events` – create event
  - JSON body: `{ "name": "...", "description": "...", "time": "2026-01-03T12:00:00", "pictures": ["https://..."] }`
- `DELETE /events/{id}` – delete an event

CORS is enabled for all origins for local testing.

## Database

- SQLite file at `events.db` in the backend folder.
