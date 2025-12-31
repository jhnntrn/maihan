# Love Timer (React)

A single React Vite app showing a romantic flip-clock counter of the elapsed **years, months, days, hours, minutes, and seconds** since **March 25, 2025, 10:23 PM GMT+7**.

## Structure

- `shared/dateDiff.js` – shared logic for computing years/months/days/hours/minutes/seconds
- `react-app/` – React 18 + Vite flip-clock UI

## Quick start

```bash
cd react-app
npm install
npm run dev
```

Open the shown localhost URL.

## Notes

- The base moment is fixed at March 25, 2025, 10:23 PM GMT+7 (UTC+7).
- Results are computed in your local timezone and refreshed every second.
- The diff walks forward (years → months → days) to handle month-length and DST edges gracefully.
