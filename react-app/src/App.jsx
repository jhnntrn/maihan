import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BASE_DATE, clampToStop, diffParts } from "../../shared/dateDiff";
import eventsUrl from "../../shared/events.json?url";
import EventAdmin from "./EventAdmin";
import defaultLoveNotes from "../../shared/loveNotes.json";
import loveNotesUrl from "../../shared/loveNotes.json?url";
import Event from "./Event";

const MOBILE_QUERY = "(max-width: 768px)";
const EVENTS_API_URL = "/api/events";
const LOVE_NOTES_API_URL = "/api/love-notes";

const COPY = {
  en: {
    sentenceIntro: "We were together for ",
    conjunction: " and ",
    totalsHeading: "Which came to",
    unitLabels: {
      years: ["year", "years"],
      months: ["month", "months"],
      days: ["day", "days"],
      hours: ["hour", "hours"],
      minutes: ["minute", "minutes"],
      seconds: ["second", "seconds"],
    },
    totalDays: "days",
    totalHours: "hours",
    totalMinutes: "minutes",
    totalSeconds: "seconds",
    timelineHeading: "Our story <3",
    onThisDayHeading: "On this day",
    thisMonthHeading: "This month in our memories",
    storyProgress: "Story progress",
    memoryMode: "Memory mode",
    closeMemoryMode: "Close memory mode",
    loadingEvents: "Loading events...",
    errorEvents: "Could not load events.",
    closePhoto: "Close photo",
  },
  vi: {
    sentenceIntro: "Bọn mình đã bên nhau tất cả",
    conjunction: " và ",
    totalsHeading: "là",
    unitLabels: {
      years: ["năm", "năm"],
      months: ["tháng", "tháng"],
      days: ["ngày", "ngày"],
      hours: ["giờ", "giờ"],
      minutes: ["phút", "phút"],
      seconds: ["giây", "giây"],
    },
    totalDays: "ngày",
    totalHours: "giờ",
    totalMinutes: "phút",
    totalSeconds: "giây",
    timelineHeading: "Câu chuyện của tụi mình <3",
    onThisDayHeading: "Ngày này năm xưa",
    thisMonthHeading: "Tháng này trong kỷ niệm",
    storyProgress: "Tiến trình câu chuyện",
    memoryMode: "Chế độ kỷ niệm",
    closeMemoryMode: "Đóng chế độ kỷ niệm",
    loadingEvents: "Đang tải sự kiện...",
    errorEvents: "Không thể tải sự kiện.",
    closePhoto: "Đóng ảnh",
  },
};

const CARD_VARIANTS = {
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

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return response.json();
}

async function fetchEvents() {
  try {
    const data = await fetchJson(EVENTS_API_URL);
    return normalizeEvents(Array.isArray(data) ? data : []);
  } catch {
    const data = await fetchJson(eventsUrl);
    return normalizeEvents(Array.isArray(data) ? data : []);
  }
}

async function fetchLoveNotes() {
  try {
    const data = await fetchJson(LOVE_NOTES_API_URL);
    return Array.isArray(data)
      ? data.filter((note) => typeof note === "string")
      : [];
  } catch {
    const data = await fetchJson(loveNotesUrl);
    return Array.isArray(data)
      ? data.filter((note) => typeof note === "string")
      : [];
  }
}

async function saveEvents(events, adminSecret) {
  const response = await fetch(EVENTS_API_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": adminSecret,
    },
    body: JSON.stringify(events),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || `Save failed with ${response.status}`);
  }

  return response.json();
}

async function saveLoveNotes(notes, adminSecret) {
  const response = await fetch(LOVE_NOTES_API_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": adminSecret,
    },
    body: JSON.stringify(notes),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || `Save failed with ${response.status}`);
  }

  return response.json();
}

async function uploadImageDataUrl(dataUrl, filename, adminSecret) {
  if (!adminSecret) {
    throw new Error("Editor secret is missing.");
  }

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": adminSecret,
    },
    body: JSON.stringify({ dataUrl, filename }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || `Upload failed with ${response.status}`);
  }

  return response.json();
}

async function uploadDraftPictures(pictures, adminSecret) {
  const uploadedPictures = [];
  let uploadCount = 0;

  for (const picture of pictures || []) {
    if (!String(picture).startsWith("data:image/")) {
      uploadedPictures.push(picture);
      continue;
    }

    const blob = await uploadImageDataUrl(
      picture,
      `event-photo-${Date.now()}-${uploadCount + 1}.jpg`,
      adminSecret,
    );
    uploadedPictures.push(blob.url);
    uploadCount += 1;
  }

  return { pictures: uploadedPictures, uploadCount };
}

async function prepareEventsForBlob(events, adminSecret) {
  let totalUploads = 0;
  const preparedEvents = [];

  for (const event of events) {
    const result = await uploadDraftPictures(event.pictures, adminSecret);
    totalUploads += result.uploadCount;
    preparedEvents.push({ ...event, pictures: result.pictures });
  }

  return { events: preparedEvents, uploadCount: totalUploads };
}

function compareEventsByTime(a, b) {
  return Date.parse(a.time) - Date.parse(b.time);
}

function normalizeBlobPictureUrl(src) {
  if (!src || typeof src !== "string") return src;
  if (src.startsWith("/api/blob?")) return src;

  try {
    const url = new URL(src);
    if (!url.hostname.endsWith(".private.blob.vercel-storage.com")) {
      return src;
    }
    const pathname = url.pathname.replace(/^\/+/, "");
    return pathname
      ? `/api/blob?pathname=${encodeURIComponent(pathname)}`
      : src;
  } catch {
    return src;
  }
}

function normalizeEvents(events) {
  return events.map((event) => ({
    ...event,
    pictures: Array.isArray(event.pictures)
      ? event.pictures.map(normalizeBlobPictureUrl)
      : [],
  }));
}

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve();
      return;
    }

    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });
}

function createRandomSeed() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] || Date.now();
  }
  return Math.floor(Math.random() * 2147483647) || Date.now();
}

function seededRandom(seed) {
  let value = seed % 2147483647 || 1;
  return () => {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

function cssEscape(value) {
  const stringValue = String(value);
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(stringValue);
  }
  return stringValue.replace(/"/g, '\\"');
}

function scrollToEventTime(time) {
  const target = document.querySelector(`[data-event-id="${cssEscape(time)}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function monthCardType(date) {
  return `month-${date.getMonth() + 1}`;
}

function progressEventKey(event) {
  return `event-${event.id || event.time}`;
}

function scrollToProgressKey(key) {
  const target = document.querySelector(
    `[data-progress-key="${cssEscape(key)}"]`,
  );
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function AdminPage() {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem("adminAuthed") === "true",
  );
  const [adminSecret, setAdminSecret] = useState(
    () => sessionStorage.getItem("adminSecret") || "",
  );
  const [password, setPassword] = useState("");
  const [events, setEvents] = useState([]);
  const [loveNotes, setLoveNotes] = useState(defaultLoveNotes);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const importInputRef = useRef(null);

  const notify = (message, type = "info") => {
    setToast({ id: Date.now(), message, type });
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ events, loveNotes }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "memory-data.json";
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    notify("Downloaded the current preview JSON.");
  };

  const loadEventsFromSource = async () => {
    setLoading(true);

    try {
      const [eventData, noteData] = await Promise.all([
        fetchEvents(),
        fetchLoveNotes(),
      ]);
      setEvents(eventData);
      setLoveNotes(noteData);
      notify(
        `Loaded ${eventData.length} event${
          eventData.length === 1 ? "" : "s"
        } and ${noteData.length} love note${noteData.length === 1 ? "" : "s"}.`,
      );
    } catch {
      setEvents([]);
      notify("Could not load events.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;

    async function loadEvents() {
      setLoading(true);

      try {
        const [data, notes] = await Promise.all([
          fetchEvents(),
          fetchLoveNotes(),
        ]);
        if (!cancelled) {
          setEvents(data);
          setLoveNotes(notes);
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
          notify("Could not load events.", "error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEvents();

    return () => {
      cancelled = true;
    };
  }, [authed]);

  // Auto-export disabled: manual download/import only

  const handleImportFile = async (file) => {
    if (!file) {
      notify("No file selected.", "error");
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedEvents = Array.isArray(parsed) ? parsed : parsed.events;
      const importedNotes = Array.isArray(parsed?.loveNotes)
        ? parsed.loveNotes
        : null;

      if (!Array.isArray(importedEvents)) {
        throw new Error("File must contain an events array.");
      }
      const normalized = normalizeEvents(importedEvents);
      setEvents(normalized);
      if (importedNotes) {
        setLoveNotes(importedNotes.filter((note) => typeof note === "string"));
      }
      notify(
        `Imported ${normalized.length} event${
          normalized.length === 1 ? "" : "s"
        } into preview. Save preview to write it to Blob.`,
      );
    } catch (err) {
      notify(err.message || "Import failed.", "error");
    }
  };

  const handleSaveEvents = async (nextEvents) => {
    await saveEvents(nextEvents, adminSecret);
    setEvents(nextEvents);
  };

  const handleSavePreview = async () => {
    setSaving(true);
    try {
      const result = await prepareEventsForBlob(events, adminSecret);
      await handleSaveEvents(result.events);
      await saveLoveNotes(loveNotes, adminSecret);
      notify(
        `Saved ${result.events.length} event${
          result.events.length === 1 ? "" : "s"
        } and ${loveNotes.length} love note${
          loveNotes.length === 1 ? "" : "s"
        } to Blob${
          result.uploadCount
            ? ` and uploaded ${result.uploadCount} image${
                result.uploadCount === 1 ? "" : "s"
              }`
            : ""
        }.`,
      );
    } catch (err) {
      notify(err.message || "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const secret = import.meta.env.VITE_ADMIN_PASSWORD || "mtriyeumaihan";
    const apiSecret = import.meta.env.VITE_ADMIN_API_SECRET || password;
    if (password === secret) {
      sessionStorage.setItem("adminAuthed", "true");
      sessionStorage.setItem("adminSecret", apiSecret);
      setAdminSecret(apiSecret);
      setAuthed(true);
    } else {
      notify("Wrong password.", "error");
    }
  };

  if (!authed) {
    return (
      <main className="app">
        <section className="note" aria-live="polite">
          <h2>Event editor</h2>
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
          </form>
        </section>
        {toast ? <Toast toast={toast} onClose={() => setToast(null)} /> : null}
      </main>
    );
  }

  return (
    <main className="app">
      <header>
        <h1>Event Studio</h1>
        <p className="sub">Manage timeline events, love notes, and pictures.</p>
        <a href="/" className="timeline-note">
          ← Back to timeline
        </a>
      </header>
      <section className="work-panel" aria-label="Event data tools">
        <div>
          <h3>Work panel</h3>
          <p>
            Import updates the browser preview first. Save preview writes the
            current event list to Blob.
          </p>
        </div>
        <div className="work-actions">
          <button
            type="button"
            className="link-button button-download"
            onClick={downloadJson}
            disabled={loading || saving}
          >
            Download JSON
          </button>
          <button
            type="button"
            className="link-button button-import"
            onClick={() => importInputRef.current?.click()}
            disabled={loading || saving}
          >
            Import JSON
          </button>
          <button
            type="button"
            className="link-button button-save"
            onClick={handleSavePreview}
            disabled={loading || saving}
          >
            {saving ? "Saving..." : "Save all changes"}
          </button>
          <button
            type="button"
            className="link-button button-cancel"
            onClick={loadEventsFromSource}
            disabled={loading || saving}
          >
            Reload from Blob
          </button>
        </div>
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
      </section>
      <EventAdmin
        events={events}
        setEvents={setEvents}
        loveNotes={loveNotes}
        setLoveNotes={setLoveNotes}
        notify={notify}
      />
      {toast ? <Toast toast={toast} onClose={() => setToast(null)} /> : null}
    </main>
  );
}

function Toast({ toast, onClose }) {
  return (
    <div
      className={`toast toast-${toast.type}`}
      role="status"
      aria-live="polite"
    >
      <span>{toast.message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  );
}

const ClockSentence = memo(function ClockSentence({
  visibleUnits,
  prevDiffRef,
  sentenceIntro,
  conjunction,
}) {
  return (
    <section className="sentence" aria-live="polite">
      <p className="sentence-text">
        <span className="sentence-intro">{sentenceIntro}</span>
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
                      ? conjunction || " and "
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
        </span>
      </p>
    </section>
  );
});

const Totals = memo(function Totals({ totals, prevTotalsRef, labels }) {
  const items = useMemo(
    () => [
      {
        key: "days",
        label: labels?.totalDays || "total days",
        value: totals.days,
      },
      {
        key: "hours",
        label: labels?.totalHours || "total hours",
        value: totals.hours,
      },
      {
        key: "minutes",
        label: labels?.totalMinutes || "total minutes",
        value: totals.minutes,
      },
      {
        key: "seconds",
        label: labels?.totalSeconds || "total seconds",
        value: totals.seconds,
      },
    ],
    [totals, labels],
  );

  return (
    <section className="totals" aria-label="Total time we were together">
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

function StoryProgressRail({ items, activeKey, visible, label, onSelect }) {
  if (!items.length) return null;
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === activeKey),
  );
  const visibleItems = items
    .map((item, index) => ({ ...item, originalIndex: index }))
    .filter((item) => {
      const distance = Math.abs(item.originalIndex - activeIndex);
      if (item.type === "year") return distance <= 22;
      if (item.type === "month") return distance <= 10;
      return distance <= 5;
    });

  return (
    <nav
      className={`story-progress ${visible ? "story-progress-visible" : ""}`}
      aria-label={label}
    >
      <div className="story-progress-line" aria-hidden="true" />
      {visibleItems.map((item) => {
        const distance = item.originalIndex - activeIndex;
        const distanceClass =
          Math.abs(distance) > 14
            ? "is-distant"
            : Math.abs(distance) > 7
              ? "is-far"
              : "";
        const directionClass =
          distance < -2 ? "is-past" : distance > 2 ? "is-future" : "";

        return (
          <button
            key={item.key}
            type="button"
            className={`story-progress-step step-${item.type} ${directionClass} ${distanceClass} ${
              activeKey === item.key ? "active" : ""
            }`}
            onClick={() => onSelect(item)}
            title={item.title || item.label}
            aria-label={item.title || item.label}
          >
            <span aria-hidden="true">✦</span>
            <span className="story-progress-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function LoadingExperience() {
  return (
    <motion.div
      className="loading-experience"
      aria-label="Loading Tri Tran and Han Tran"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: "-4%" }}
      transition={{ duration: 0.44, ease: "easeOut" }}
    >
      <motion.div
        className="loading-name-block"
        initial={{ scale: 0.94, rotate: -2 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 0.8, ease: [0.18, 0.9, 0.26, 1.08] }}
      >
        <span data-text="Tri Tran and">Tri Tran and</span>
        <span data-text="Han Tran">Han Tran</span>
      </motion.div>
    </motion.div>
  );
}

function MemoryIntroStack({ photos, visible }) {
  if (!visible || !photos.length) return null;
  const messyPile = [
    { x: -34, y: 20, rotate: -17, scale: 0.94 },
    { x: 26, y: -14, rotate: 13, scale: 1.03 },
    { x: -10, y: 8, rotate: 4, scale: 0.99 },
    { x: 46, y: 24, rotate: 21, scale: 0.9 },
    { x: -48, y: -20, rotate: -28, scale: 0.86 },
    { x: 8, y: -34, rotate: -8, scale: 0.96 },
    { x: -24, y: 38, rotate: 24, scale: 0.88 },
    { x: 52, y: -30, rotate: -19, scale: 0.84 },
    { x: 2, y: 18, rotate: 9, scale: 1.06 },
  ];

  return (
    <motion.div
      className="memory-intro"
      aria-hidden="true"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.42, ease: "easeOut" }}
    >
      <div className="memory-intro-stack">
        {photos.map((photo, index) => {
          const landing = messyPile[index % messyPile.length];
          const entryX = landing.x * -0.7;

          return (
            <motion.img
              key={`${photo.id}-intro`}
              src={photo.src}
              alt=""
              draggable="false"
              initial={{
                opacity: 0,
                y: "-62vh",
                x: entryX,
                rotate: landing.rotate - 34,
                scale: landing.scale * 0.78,
              }}
              animate={{
                opacity: 1,
                y: landing.y,
                x: landing.x,
                rotate: landing.rotate,
                scale: landing.scale,
              }}
              transition={{
                delay: index * 0.1,
                duration: 0.78,
                ease: [0.18, 0.9, 0.26, 1.08],
              }}
              style={{ zIndex: index + 1 }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

function shuffleWithSeed(items, seed) {
  const rand = seededRandom(seed);
  return [...items]
    .map((item) => ({ item, order: rand() }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

function MemoryModeOverlay({ photos, labels, locale, onClose }) {
  const [deck, setDeck] = useState(() =>
    shuffleWithSeed(photos, createRandomSeed()),
  );
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    setDeck(shuffleWithSeed(photos, createRandomSeed()));
    setCurrent(null);
  }, [photos]);

  if (!photos.length) return null;

  const pullNext = () => {
    if (!deck.length) return;
    const [next, ...rest] = deck;
    setCurrent({
      ...next,
      memoryRotate: Math.round((Math.random() * 16 - 8) * 10) / 10,
    });
    setDeck(rest);
  };

  const visibleStack = deck.slice(0, 8);
  const remainingCount = deck.length;
  const messyDeck = [
    { x: -42, y: 28, rotate: -24, scale: 0.9 },
    { x: 26, y: -18, rotate: 17, scale: 0.98 },
    { x: -12, y: -34, rotate: -7, scale: 0.93 },
    { x: 48, y: 34, rotate: 29, scale: 0.86 },
    { x: -56, y: -8, rotate: 12, scale: 0.84 },
    { x: 4, y: 22, rotate: -31, scale: 0.95 },
    { x: 38, y: -44, rotate: -15, scale: 0.8 },
    { x: -30, y: 50, rotate: 21, scale: 0.82 },
  ];
  const eventDate = current?.eventTime
    ? new Date(current.eventTime).toLocaleDateString(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <motion.div
      className="memory-mode"
      role="dialog"
      aria-modal="true"
      aria-label={labels.memoryMode}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        className="memory-mode-close"
        onClick={onClose}
        aria-label={labels.closeMemoryMode}
      >
        ×
      </button>
      <section className="memory-mode-stage">
        <div className="memory-mode-pile">
          <div className="memory-mode-deck" aria-hidden="true">
            {visibleStack.map((photo, index) => {
              const landing = messyDeck[index % messyDeck.length];
              return (
                <motion.img
                  key={`deck-${photo.id}`}
                  src={photo.src}
                  alt=""
                  initial={false}
                  animate={landing}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  style={{ zIndex: visibleStack.length - index }}
                />
              );
            })}
          </div>
          <span className="memory-mode-count">{remainingCount} left</span>
        </div>

        <div className="memory-mode-focus">
          <AnimatePresence mode="wait">
            {current ? (
              <motion.figure
                key={current.id}
                className="memory-mode-current"
                initial={{
                  opacity: 0,
                  y: -80,
                  x: -120,
                  rotate: 18,
                  scale: 0.82,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  x: 0,
                  rotate: current.memoryRotate ?? -2,
                  scale: 1,
                }}
                exit={{ opacity: 0, y: 70, x: 90, rotate: -12, scale: 0.86 }}
                transition={{ duration: 0.34, ease: "easeOut" }}
              >
                <img src={current.src} alt="" />
              </motion.figure>
            ) : (
              <motion.div
                key="empty"
                className="memory-mode-placeholder"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                {remainingCount
                  ? "Pull a memory"
                  : "You reached the end of the stack"}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="memory-mode-side">
          <button
            type="button"
            className="memory-mode-pull"
            onClick={pullNext}
            disabled={!remainingCount}
          >
            {remainingCount
              ? `Pull next (${remainingCount})`
              : "No more photos"}
          </button>
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={current.id}
                className="memory-mode-info"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 14 }}
              >
                <strong>{current.eventName}</strong>
                {eventDate ? <span>{eventDate}</span> : null}
              </motion.div>
            ) : (
              <motion.div
                key="empty-info"
                className="memory-mode-info is-empty"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 14 }}
              >
                Pull a photo to see its memory info.
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </section>
    </motion.div>
  );
}

function TimelinePage() {
  const prefersReducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  );
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem("lang") || "vi";
  });
  const randomSeed = useMemo(() => createRandomSeed(), []);
  const introSeed = useMemo(() => createRandomSeed(), []);
  const [now, setNow] = useState(() => new Date());
  const [noteIndex, setNoteIndex] = useState(0);
  const [events, setEvents] = useState([]);
  const [loveNotes, setLoveNotes] = useState(defaultLoveNotes);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [typedNote, setTypedNote] = useState("");
  const [notePhase, setNotePhase] = useState("typing");
  const [activeWallPhoto, setActiveWallPhoto] = useState(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryModeOpen, setMemoryModeOpen] = useState(false);
  const [storyProgressVisible, setStoryProgressVisible] = useState(false);
  const [activeProgressKey, setActiveProgressKey] = useState("");
  const [loadingExperienceVisible, setLoadingExperienceVisible] =
    useState(true);
  const [loaderMinimumDone, setLoaderMinimumDone] = useState(false);
  const [loaderImagesLoaded, setLoaderImagesLoaded] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);

  const storyRef = useRef(null);
  const prevDiffRef = useRef(null);
  const prevTotalsRef = useRef({
    days: null,
    hours: null,
    minutes: null,
    seconds: null,
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);
    updateIsMobile();

    mediaQuery.addEventListener("change", updateIsMobile);
    return () => mediaQuery.removeEventListener("change", updateIsMobile);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language === "vi" ? "vi" : "en";
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("lang", language);
    }
  }, [language]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setEventsError("");
    setLoadingEvents(true);

    async function loadEvents() {
      try {
        const [data, notes] = await Promise.all([
          fetchEvents(),
          fetchLoveNotes(),
        ]);
        if (!cancelled) {
          setEvents(data);
          setLoveNotes(notes);
        }
      } catch {
        if (!cancelled) {
          setEventsError("Could not load events.");
          setEvents([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingEvents(false);
        }
      }
    }

    loadEvents();

    return () => {
      cancelled = true;
    };
  }, []);

  const locale = language === "vi" ? "vi-VN" : undefined;
  const t = COPY[language] || COPY.en;
  const mobileLightMotion = isMobile && !prefersReducedMotion;

  const clockNow = useMemo(() => clampToStop(now), [now]);

  const diff = useMemo(() => diffParts(BASE_DATE, clockNow), [clockNow]);

  const visibleUnits = useMemo(() => {
    const labelFor = (key, value) => {
      const labels = t.unitLabels?.[key];
      if (!labels) return value === 1 ? key : `${key}s`;
      if (Array.isArray(labels)) {
        return value === 1 ? labels[0] : labels[1];
      }
      return labels;
    };

    const units = [
      {
        key: "years",
        label: labelFor("years", diff.years),
        value: diff.years,
      },
      {
        key: "months",
        label: labelFor("months", diff.months),
        value: diff.months,
      },
      {
        key: "days",
        label: labelFor("days", diff.days),
        value: diff.days,
      },
      {
        key: "hours",
        label: labelFor("hours", diff.hours),
        value: diff.hours,
        padLength: 2,
      },
      {
        key: "minutes",
        label: labelFor("minutes", diff.minutes),
        value: diff.minutes,
        padLength: 2,
      },
      {
        key: "seconds",
        label: labelFor("seconds", diff.seconds),
        value: diff.seconds,
        padLength: 2,
      },
    ];

    const nonZero = units.filter((u) => u.value > 0);
    if (nonZero.length) return nonZero;
    // If everything is zero (very first tick), show seconds only
    return [units[units.length - 1]];
  }, [diff, t]);

  useEffect(() => {
    prevDiffRef.current = diff;
  }, [diff]);

  const totals = useMemo(() => {
    const ms = Math.max(0, clockNow.getTime() - BASE_DATE.getTime());
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
  }, [clockNow]);

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
  }, [loveNotes, noteIndex]);

  const enrichedEvents = useMemo(() => {
    const sorted = [...events].sort(compareEventsByTime);

    const assignSides = (list) => {
      // Pseudo-random per page load; still deterministic during a session
      let seed = randomSeed % 2147483647 || 1;

      const rand = () => {
        seed = (seed * 48271) % 2147483647;
        return seed / 2147483647;
      };

      let lastSide = null;
      let runLength = 0;

      return list.map(() => {
        let side = rand() < 0.5 ? "left" : "right";

        if (side === lastSide) {
          runLength += 1;
          if (runLength >= 4) {
            side = side === "left" ? "right" : "left";
            runLength = 1;
          }
        } else {
          runLength = 1;
        }

        lastSide = side;
        return side;
      });
    };

    const sides = assignSides(sorted);

    return sorted.map((evt, idx) => {
      const d = new Date(evt.time);
      return {
        ...evt,
        side: sides[idx],
        idx,
        monthKey: `${d.getFullYear()}-${d.getMonth()}`,
        monthLabel: d.toLocaleString(locale, {
          month: "long",
          year: "numeric",
        }),
        cardType: monthCardType(d),
        progressKey: progressEventKey(evt),
      };
    });
  }, [events, locale, randomSeed]);

  const timelineItems = useMemo(() => {
    const items = [];
    let lastMonth = null;
    enrichedEvents.forEach((evt, idx) => {
      if (evt.monthKey !== lastMonth) {
        const monthProgressKey = `month-${evt.monthKey}`;
        items.push({
          type: "month",
          id: monthProgressKey,
          progressKey: monthProgressKey,
          label: evt.monthLabel,
        });
        lastMonth = evt.monthKey;
      }
      items.push({ type: "event", data: evt, idx });
    });
    return items;
  }, [enrichedEvents]);

  const storyProgressItems = useMemo(() => {
    const items = [];
    let lastYear = null;
    let lastMonth = null;

    enrichedEvents.forEach((event) => {
      const date = new Date(event.time);
      const year = date.getFullYear();
      const monthKey = `${year}-${date.getMonth()}`;

      if (year !== lastYear) {
        items.push({
          key: `year-${year}`,
          targetKey: event.progressKey,
          type: "year",
          label: String(year),
        });
        lastYear = year;
      }

      if (monthKey !== lastMonth) {
        items.push({
          key: event.progressKey,
          targetKey: event.progressKey,
          type: "month",
          label: date.toLocaleString(locale, { month: "short" }),
          title: `${date.toLocaleString(locale, {
            month: "long",
            year: "numeric",
          })}: ${event.name}`,
        });
        lastMonth = monthKey;
        return;
      }

      items.push({
        key: event.progressKey,
        targetKey: event.progressKey,
        type: "event",
        label: event.name,
      });
    });

    return items;
  }, [enrichedEvents, locale]);

  const photoWallItems = useMemo(
    () =>
      enrichedEvents.flatMap((event) =>
        (event.pictures || []).map((src, photoIndex) => ({
          id: `${event.id || event.time}-${photoIndex}-${src.slice(0, 24)}`,
          src,
          eventName: event.name,
          eventTime: event.time,
          photoIndex,
        })),
      ),
    [enrichedEvents],
  );

  const introPhotos = useMemo(() => {
    const rand = seededRandom(introSeed);
    return [...photoWallItems]
      .map((photo) => ({ photo, order: rand() }))
      .sort((a, b) => a.order - b.order)
      .slice(0, 9)
      .map(({ photo }) => photo);
  }, [introSeed, photoWallItems]);

  const memoryMatches = useMemo(() => {
    const month = now.getMonth();
    const day = now.getDate();
    const year = now.getFullYear();
    return enrichedEvents
      .map((event) => ({ event, date: new Date(event.time) }))
      .filter(
        ({ date }) => date.getFullYear() < year && date.getMonth() === month,
      )
      .sort((a, b) => {
        const aExact = a.date.getDate() === day ? 0 : 1;
        const bExact = b.date.getDate() === day ? 0 : 1;
        return (
          aExact - bExact ||
          Math.abs(a.date.getDate() - day) - Math.abs(b.date.getDate() - day)
        );
      })
      .map((match) => {
        const exactDay = match.date.getDate() === day;
        return {
          ...match,
          exactDay,
          label: exactDay ? t.onThisDayHeading : t.thisMonthHeading,
        };
      });
  }, [enrichedEvents, now, t]);

  useEffect(() => {
    const node = storyRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setStoryProgressVisible(false);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setStoryProgressVisible(entry.isIntersecting),
      { threshold: 0.04 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [storyProgressItems.length]);

  useEffect(() => {
    if (!storyProgressVisible || !storyProgressItems.length) {
      return undefined;
    }

    const updateActiveProgress = () => {
      const checkpoint = window.innerHeight * 0.42;
      let active = storyProgressItems[0].key;

      storyProgressItems.forEach((item) => {
        const target = document.querySelector(
          `[data-progress-key="${cssEscape(item.targetKey)}"]`,
        );
        if (!target) return;

        const rect = target.getBoundingClientRect();
        if (rect.top <= checkpoint) {
          active = item.key;
        }
      });

      setActiveProgressKey(active);
    };

    updateActiveProgress();
    window.addEventListener("scroll", updateActiveProgress, { passive: true });
    window.addEventListener("resize", updateActiveProgress);

    return () => {
      window.removeEventListener("scroll", updateActiveProgress);
      window.removeEventListener("resize", updateActiveProgress);
    };
  }, [storyProgressItems, storyProgressVisible]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setLoaderMinimumDone(true);
      return undefined;
    }

    const timeout = window.setTimeout(
      () => setLoaderMinimumDone(true),
      4000,
    );
    return () => window.clearTimeout(timeout);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setLoaderImagesLoaded(true);
      return undefined;
    }

    if (loadingEvents) {
      setLoaderImagesLoaded(false);
      return undefined;
    }

    let cancelled = false;
    const sources = Array.from(
      new Set([
        "/images/background.jpg",
        ...photoWallItems.map((photo) => photo.src),
      ]),
    );

    setLoaderImagesLoaded(false);
    Promise.allSettled(sources.map(preloadImage)).then(() => {
      if (!cancelled) setLoaderImagesLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [loadingEvents, photoWallItems, prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setLoadingExperienceVisible(false);
      return;
    }

    setLoadingExperienceVisible(!(loaderMinimumDone && loaderImagesLoaded));
  }, [loaderImagesLoaded, loaderMinimumDone, prefersReducedMotion]);

  useEffect(() => {
    if (
      prefersReducedMotion ||
      loadingExperienceVisible ||
      !introPhotos.length
    ) {
      setIntroVisible(false);
      return undefined;
    }

    setIntroVisible(true);
    const timeout = window.setTimeout(() => setIntroVisible(false), 2800);
    return () => window.clearTimeout(timeout);
  }, [introPhotos.length, loadingExperienceVisible, prefersReducedMotion]);

  const reduceMotion = prefersReducedMotion;

  const scrollToMemoryEvent = (memory) => {
    if (!memory) return;
    scrollToEventTime(memory.event.time);
    setMemoryOpen(false);
  };

  return (
    <main className="app">
      <AnimatePresence>
        {loadingExperienceVisible ? <LoadingExperience /> : null}
      </AnimatePresence>
      <AnimatePresence>
        {introVisible ? (
          <MemoryIntroStack photos={introPhotos} visible={introVisible} />
        ) : null}
      </AnimatePresence>
      <StoryProgressRail
        items={storyProgressItems}
        activeKey={activeProgressKey}
        visible={storyProgressVisible}
        label={t.storyProgress}
        onSelect={(item) => scrollToProgressKey(item.targetKey)}
      />
      {memoryMatches.length ? (
        <div className="memory-widget">
          <button
            type="button"
            className="memory-bell"
            onClick={() => setMemoryOpen((open) => !open)}
            aria-label="Toggle memory reminders"
            aria-expanded={memoryOpen}
          >
            <span aria-hidden="true">🔔</span>
            <span className="memory-count">{memoryMatches.length}</span>
          </button>
          {memoryOpen ? (
            <div className="memory-popover" role="list">
              {memoryMatches.map((memory) => (
                <button
                  key={`${memory.event.time}-${memory.event.name}`}
                  type="button"
                  className="memory-preview"
                  onClick={() => scrollToMemoryEvent(memory)}
                  role="listitem"
                >
                  <span className="memory-preview-badge">{memory.label}</span>
                  <strong>{memory.event.name}</strong>
                  <span>
                    {memory.date.toLocaleDateString(locale, {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="memory-mode-button"
        onClick={() => setMemoryModeOpen(true)}
        disabled={!photoWallItems.length}
      >
        {t.memoryMode}
      </button>
      <motion.button
        type="button"
        className="lang-toggle"
        data-lang={language}
        onClick={() => setLanguage((prev) => (prev === "en" ? "vi" : "en"))}
        aria-label="Toggle language"
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
      >
        <span className="lang-pill">
          <span className={`lang-label ${language === "vi" ? "active" : ""}`}>
            VI
          </span>
          <span className={`lang-label ${language === "en" ? "active" : ""}`}>
            EN
          </span>
          <motion.span
            className="lang-thumb"
            animate={{ x: language === "vi" ? "0%" : "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          />
        </span>
      </motion.button>
      <header className="hero-spacer" aria-hidden="true" />

      <ClockSentence
        visibleUnits={visibleUnits}
        prevDiffRef={prevDiffRef}
        sentenceIntro={t.sentenceIntro}
        conjunction={t.conjunction}
      />

      <h2 className="totals-heading">{t.totalsHeading}</h2>
      <Totals totals={totals} prevTotalsRef={prevTotalsRef} labels={t} />

      <section className="note" aria-live="polite">
        <p key={noteIndex} className={`note-text ${notePhase}`}>
          {typedNote}
        </p>
      </section>

      <section className="timeline" aria-label="Our storyline" ref={storyRef}>
        <h2>{t.timelineHeading}</h2>
        {eventsError ? <p className="timeline-note">{t.errorEvents}</p> : null}
        {loadingEvents ? (
          <p className="timeline-note">{t.loadingEvents}</p>
        ) : null}
        <div className="timeline-list">
          {timelineItems.map((item) => {
            if (item.type === "month") {
              return (
                <div
                  key={item.id}
                  className="timeline-month"
                  data-progress-key={item.progressKey}
                >
                  <span>{item.label}</span>
                </div>
              );
            }
            return (
              <Event
                key={`${item.data.time}-${item.idx}`}
                event={item.data}
                idx={item.idx}
                variants={CARD_VARIANTS}
                reduceMotion={reduceMotion}
                locale={locale}
                copy={t}
                mobileLightMotion={mobileLightMotion}
              />
            );
          })}
        </div>
      </section>

      {photoWallItems.length ? (
        <section className="photo-wall" aria-label="Photo wall">
          <div className="photo-wall-header">
            <h2>{language === "vi" ? "Tường ảnh" : "Photo wall"}</h2>
            <p>
              {language === "vi"
                ? "Một góc nhỏ gom lại những khoảnh khắc của tụi mình."
                : "A little corner for the moments we keep coming back to."}
            </p>
          </div>
          <div className="photo-wall-grid">
            {photoWallItems.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                className={`photo-wall-item photo-wall-item-${(index % 7) + 1}`}
                onClick={() => setActiveWallPhoto(photo)}
                aria-label={`${photo.eventName} photo ${photo.photoIndex + 1}`}
              >
                <img src={photo.src} alt="" loading="lazy" />
                <span>{photo.eventName}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <AnimatePresence>
        {memoryModeOpen ? (
          <MemoryModeOverlay
            photos={photoWallItems}
            labels={t}
            locale={locale}
            onClose={() => setMemoryModeOpen(false)}
          />
        ) : null}
        {activeWallPhoto ? (
          <motion.div
            className="photo-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={`${activeWallPhoto.eventName} photo`}
            onClick={() => setActiveWallPhoto(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <motion.div
              className="photo-modal"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <button
                type="button"
                className="photo-modal-close"
                onClick={() => setActiveWallPhoto(null)}
                aria-label={t.closePhoto}
              >
                ×
              </button>
              <img src={activeWallPhoto.src} alt={activeWallPhoto.eventName} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

export default function App() {
  const [path, setPath] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/",
  );

  useEffect(() => {
    const handlePop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  return path.startsWith("/admin") ? <AdminPage /> : <TimelinePage />;
}
