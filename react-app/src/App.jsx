import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BASE_DATE, diffParts } from "../../shared/dateDiff";
import eventsUrl from "../../shared/events.json?url";
import EventAdmin from "./EventAdmin";
import loveNotes from "../../shared/loveNotes.json";
import Event from "./Event";

const BASE_TEXT = BASE_DATE.toLocaleString(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

function AdminPage() {
  const [authed, setAuthed] = useState(
    () => localStorage.getItem("adminAuthed") === "true"
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const importInputRef = useRef(null);

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "events.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    setFetchError("");
    fetch(eventsUrl, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => {
        setFetchError("Could not load events.json");
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, [authed]);

  // Auto-export disabled: manual download/import only

  const handleImportFile = async (file) => {
    setImportStatus("");
    if (!file) {
      setImportStatus("No file selected.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error("File must contain a JSON array of events.");
      }
      setEvents(parsed);
      setImportStatus(
        `Imported ${parsed.length} event${parsed.length === 1 ? "" : "s"}.`
      );
    } catch (err) {
      setImportStatus(err.message || "Import failed.");
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const secret = import.meta.env.VITE_ADMIN_PASSWORD || "mtriyeumaihan";
    if (password === secret) {
      localStorage.setItem("adminAuthed", "true");
      setAuthed(true);
      setError("");
    } else {
      setError("Wrong password.");
    }
  };

  if (!authed) {
    return (
      <main className="app">
        <section className="note" aria-live="polite">
          <h2>Admin login</h2>
          <form className="admin-form" onSubmit={handleLogin}>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit">Enter</button>
            {error ? <p className="admin-status">{error}</p> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <header>
        <h1>Admin Events</h1>
        <p className="sub">Manage timeline events and pictures.</p>
        <a href="/" className="timeline-note">
          ← Back to timeline
        </a>
        <button type="button" className="link-button" onClick={downloadJson}>
          Download events.json
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => importInputRef.current?.click()}
        >
          Import events.json
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = "";
          }}
        />
      </header>
      {importStatus ? <p className="timeline-note">{importStatus}</p> : null}
      {loading ? <p className="timeline-note">Loading events...</p> : null}
      <EventAdmin events={events} setEvents={setEvents} />
    </main>
  );
}

const ClockSentence = memo(function ClockSentence({
  visibleUnits,
  prevDiffRef,
}) {
  return (
    <section className="sentence" aria-live="polite">
      <p className="sentence-text">
        <span className="sentence-intro">We have been together for </span>
        <span className="sentence-list">
          <AnimatePresence initial={false} mode="popLayout">
            {visibleUnits.map((unit, index) => {
              const isLast = index === visibleUnits.length - 1;
              const isSecondLast = index === visibleUnits.length - 2;
              const separator =
                visibleUnits.length === 1
                  ? ""
                  : isLast
                  ? ""
                  : isSecondLast
                  ? " and "
                  : ", ";

              const prevVal = prevDiffRef.current?.[unit.key] ?? unit.value;
              const currDigits = String(unit.value).split("");
              const prevDigits = String(prevVal).split("");

              return (
                <motion.span
                  layout
                  key={unit.key}
                  className="unit"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <span className="unit-number">
                    {currDigits.map((digit, i) => (
                      <span
                        key={`${unit.key}-${i}-${digit}`}
                        className={`unit-digit ${
                          prevDigits[i] !== digit ? "flip" : ""
                        }`}
                      >
                        {digit}
                      </span>
                    ))}
                  </span>
                  <span className="unit-label">
                    {` ${unit.label}${separator}`}
                  </span>
                </motion.span>
              );
            })}
          </AnimatePresence>
          <span className="sentence-end">.</span>
        </span>
      </p>
    </section>
  );
});

const Totals = memo(function Totals({ totals, prevTotalsRef }) {
  const items = useMemo(
    () => [
      { key: "days", label: "total days", value: totals.days },
      { key: "hours", label: "total hours", value: totals.hours },
      { key: "minutes", label: "total minutes", value: totals.minutes },
      { key: "seconds", label: "total seconds", value: totals.seconds },
    ],
    [totals]
  );

  return (
    <section className="totals" aria-label="Total time together">
      {items.map((t) => {
        const prev = prevTotalsRef.current?.[t.key] ?? t.value;
        const padLen = Math.max(t.value.length, String(prev).length);
        const currDigits = t.value.padStart(padLen, "0").split("");
        const prevDigits = String(prev).padStart(padLen, "0").split("");

        return (
          <div className="total-item" key={t.key}>
            <span className="total-value">
              {currDigits.map((digit, i) => (
                <span
                  key={`${t.key}-${i}-${digit}`}
                  className={`total-digit ${
                    prevDigits[i] !== digit ? "flip" : ""
                  }`}
                >
                  {digit}
                </span>
              ))}
            </span>
            <span className="total-label">{t.label}</span>
          </div>
        );
      })}
    </section>
  );
});

export default function App() {
  const [now, setNow] = useState(() => new Date());
  const [noteIndex, setNoteIndex] = useState(0);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [typedNote, setTypedNote] = useState("");
  const [notePhase, setNotePhase] = useState("typing");
  const [activeEvent, setActiveEvent] = useState(null);
  const toggleRef = useRef(null);
  const [path, setPath] = useState(() => window.location.pathname);

  const prevDiffRef = useRef(null);
  const prevTotalsRef = useRef({
    days: null,
    hours: null,
    minutes: null,
    seconds: null,
  });

  useEffect(() => {
    const handlePop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setEventsError("");
    setLoadingEvents(true);
    fetch(eventsUrl, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => {
        setEventsError("Could not load events.json");
        setEvents([]);
      })
      .finally(() => setLoadingEvents(false));
  }, []);

  // Theme toggle removed to keep background static

  if (path.startsWith("/admin")) {
    return <AdminPage />;
  }

  const diff = useMemo(() => diffParts(BASE_DATE, now), [now]);

  const visibleUnits = useMemo(() => {
    const units = [
      {
        key: "years",
        label: diff.years === 1 ? "year" : "years",
        value: diff.years,
      },
      {
        key: "months",
        label: diff.months === 1 ? "month" : "months",
        value: diff.months,
      },
      {
        key: "days",
        label: diff.days === 1 ? "day" : "days",
        value: diff.days,
      },
      {
        key: "hours",
        label: diff.hours === 1 ? "hour" : "hours",
        value: diff.hours,
        padLength: 2,
      },
      {
        key: "minutes",
        label: diff.minutes === 1 ? "minute" : "minutes",
        value: diff.minutes,
        padLength: 2,
      },
      {
        key: "seconds",
        label: diff.seconds === 1 ? "second" : "seconds",
        value: diff.seconds,
        padLength: 2,
      },
    ];

    const nonZero = units.filter((u) => u.value > 0);
    if (nonZero.length) return nonZero;
    // If everything is zero (very first tick), show seconds only
    return [units[units.length - 1]];
  }, [diff]);

  useEffect(() => {
    prevDiffRef.current = diff;
  }, [diff]);

  const totals = useMemo(() => {
    const ms = Math.max(0, now.getTime() - BASE_DATE.getTime());
    const totalSeconds = Math.floor(ms / 1000);
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const totalHours = Math.floor(ms / (1000 * 60 * 60));
    const totalDays = Math.floor(ms / (1000 * 60 * 60 * 24));

    return {
      days: String(totalDays),
      hours: String(totalHours),
      minutes: String(totalMinutes),
      seconds: String(totalSeconds),
    };
  }, [now]);

  useEffect(() => {
    prevTotalsRef.current = totals;
  }, [totals]);

  useEffect(() => {
    if (!loveNotes.length) return undefined;

    let cancelled = false;
    let timeoutId;
    const currentNote = loveNotes[noteIndex % loveNotes.length];

    const type = (i) => {
      if (cancelled) return;
      if (i <= currentNote.length) {
        setTypedNote(currentNote.slice(0, i));
        setNotePhase("typing");
        timeoutId = setTimeout(() => type(i + 1), 55);
      } else {
        setNotePhase("done");
        timeoutId = setTimeout(() => erase(currentNote.length), 1800);
      }
    };

    const erase = (i) => {
      if (cancelled) return;
      if (i >= 0) {
        setTypedNote(currentNote.slice(0, i));
        setNotePhase("erasing");
        timeoutId = setTimeout(() => erase(i - 1), 26);
      } else {
        setNotePhase("typing");
        setNoteIndex((prev) => (prev + 1) % loveNotes.length);
      }
    };

    type(1);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [noteIndex]);

  const enrichedEvents = useMemo(() => {
    return [...events]
      .sort((a, b) => new Date(a.time) - new Date(b.time))
      .map((evt, idx) => {
        const d = new Date(evt.time);
        return {
          ...evt,
          side: idx % 2 === 0 ? "left" : "right",
          idx,
          monthKey: `${d.getFullYear()}-${d.getMonth()}`,
          monthLabel: d.toLocaleString(undefined, {
            month: "long",
            year: "numeric",
          }),
        };
      });
  }, [events]);

  const timelineItems = useMemo(() => {
    const items = [];
    let lastMonth = null;
    enrichedEvents.forEach((evt, idx) => {
      if (evt.monthKey !== lastMonth) {
        items.push({
          type: "month",
          id: `month-${evt.monthKey}`,
          label: evt.monthLabel,
        });
        lastMonth = evt.monthKey;
      }
      items.push({ type: "event", data: evt, idx });
    });
    return items;
  }, [enrichedEvents]);

  const cardVariants = {
    hidden: (side) => ({
      opacity: 0,
      y: 24,
      x: side === "left" ? -30 : 30,
      rotate: side === "left" ? -2 : 2,
      scale: 0.98,
    }),
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      rotate: 0,
      scale: 1,
      transition: { type: "spring", damping: 18, stiffness: 200 },
    },
  };

  return (
    <main className="app">
      <header>
        <p className="eyebrow">For us</p>
        <h1>Every moment since {BASE_TEXT}</h1>
        <p className="sub">Counting all the time we’ve been together.</p>
      </header>

      <ClockSentence visibleUnits={visibleUnits} prevDiffRef={prevDiffRef} />

      <h2 className="totals-heading">Which means</h2>
      <Totals totals={totals} prevTotalsRef={prevTotalsRef} />

      <section className="note" aria-live="polite">
        <p key={noteIndex} className={`note-text ${notePhase}`}>
          {typedNote}
        </p>
      </section>

      <section className="timeline" aria-label="Our storyline">
        <h2>Our storyline</h2>
        {eventsError ? <p className="timeline-note">{eventsError}</p> : null}
        {loadingEvents ? (
          <p className="timeline-note">Loading events...</p>
        ) : null}
        <div className="timeline-list">
          {timelineItems.map((item) => {
            if (item.type === "month") {
              return (
                <div key={item.id} className="timeline-month">
                  <span>{item.label}</span>
                </div>
              );
            }
            return (
              <Event
                key={`${item.data.time}-${item.idx}`}
                event={item.data}
                idx={item.idx}
                variants={cardVariants}
              />
            );
          })}
        </div>
      </section>

      {activeEvent ? (
        <div
          className="event-detail-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeEvent.name} details`}
          onClick={() => setActiveEvent(null)}
        >
          <div className="event-detail" onClick={(e) => e.stopPropagation()}>
            <button
              className="event-detail-close"
              type="button"
              onClick={() => setActiveEvent(null)}
              aria-label="Close details"
            >
              ×
            </button>
            <p className="event-detail-date">
              {new Date(activeEvent.time).toLocaleString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h3 className="event-detail-name">{activeEvent.name}</h3>
            <p className="event-detail-desc">{activeEvent.description}</p>
            {activeEvent.pictures?.length ? (
              <div className="event-detail-photos">
                {activeEvent.pictures.map((src, idx) => (
                  <img
                    key={`${activeEvent.time}-${idx}`}
                    src={src}
                    alt={activeEvent.name}
                    loading="lazy"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <footer></footer>
    </main>
  );
}
