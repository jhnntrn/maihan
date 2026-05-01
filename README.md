# Love Timer (React)

A single React Vite app showing a romantic flip-clock counter of the elapsed **years, months, days, hours, minutes, and seconds** since **March 31, 2025, 10:23 PM GMT+7**.

## Structure

- `shared/dateDiff.js` – shared logic for computing years/months/days/hours/minutes/seconds
- `react-app/` – React 19 + Vite 8 flip-clock UI

## Quick start

```bash
cd react-app
npm install
npm run lint
npm run dev
```

Open the shown localhost URL.

## Vercel Blob events

The admin page reads and writes events through Vercel Functions backed by Vercel Blob.

Required Vercel environment variables:

- `BLOB_READ_WRITE_TOKEN` - created automatically when the Blob store is connected.
- `VITE_ADMIN_PASSWORD` - the password shown to the browser for the admin login.
- `ADMIN_API_SECRET` - secret checked by `/api/events` and `/api/upload`.
- `VITE_ADMIN_API_SECRET` - set this to the same value as `ADMIN_API_SECRET` so the admin UI can send it.

Seed the current local events into Blob:

```bash
cd react-app
vercel env pull .env.local
set -a
source .env.local
set +a
npm run seed:events
```

After seeding, `/api/events` becomes the source of truth. `shared/events.json` remains the local fallback for development or first load before Blob is seeded.

## Notes

- Node.js 20.19+ or 22.12+ is required by Vite 8.
- The base moment is fixed at March 31, 2025, 10:23 PM GMT+7 (UTC+7).
- Results are computed in your local timezone and refreshed every second.
- The diff walks forward (years → months → days) to handle month-length and DST edges gracefully.
