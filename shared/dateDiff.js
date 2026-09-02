const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const BASE_DATE_ISO = "2025-03-31T22:23:00+07:00"; // March 31, 2025 10:23 PM GMT+7
export const BASE_DATE = new Date(BASE_DATE_ISO);

// The counter is frozen here; time after this instant no longer counts.
const STOP_DATE_ISO = "2026-09-01T17:45:00+07:00"; // Sep 1, 2026 5:45 PM GMT+7
export const STOP_DATE = new Date(STOP_DATE_ISO);

export function clampToStop(date) {
  return date > STOP_DATE ? STOP_DATE : date;
}

function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const desiredMonth = d.getMonth() + months;
  d.setMonth(desiredMonth);

  // Handle month overflow (e.g., adding months to 31st)
  if (d.getMonth() !== ((desiredMonth % 12) + 12) % 12) {
    d.setDate(0); // go to last day of previous month
  }
  return d;
}

export function diffParts(startDate = BASE_DATE, endDate = new Date()) {
  if (endDate < startDate) {
    return {
      years: 0,
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  // Walk forward to avoid DST/overflow pitfalls.
  let anchor = new Date(startDate.getTime());
  let years = 0;
  while (true) {
    const next = addYears(anchor, 1);
    if (next <= endDate) {
      anchor = next;
      years += 1;
    } else {
      break;
    }
  }

  let months = 0;
  while (true) {
    const next = addMonths(anchor, 1);
    if (next <= endDate) {
      anchor = next;
      months += 1;
    } else {
      break;
    }
  }

  const remainingMs = endDate - anchor;
  const days = Math.floor(remainingMs / MS_PER_DAY);
  const afterDays = remainingMs - days * MS_PER_DAY;
  const hours = Math.floor(afterDays / MS_PER_HOUR);
  const afterHours = afterDays - hours * MS_PER_HOUR;
  const minutes = Math.floor(afterHours / MS_PER_MINUTE);
  const afterMinutes = afterHours - minutes * MS_PER_MINUTE;
  const seconds = Math.floor(afterMinutes / MS_PER_SECOND);

  return { years, months, days, hours, minutes, seconds };
}

// Backwards-friendly alias
export const diffYearsMonthsDays = diffParts;
