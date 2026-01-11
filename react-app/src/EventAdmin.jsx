import { useMemo, useRef, useState } from "react";

function parsePictures(input) {
  if (!input.trim()) return [];
  return input
    .split(/\r?\n/) // keep data URLs intact (they contain commas)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function EventAdmin({ events, setEvents }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState("");
  const [picturesInput, setPicturesInput] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const picturesList = useMemo(
    () => parsePictures(picturesInput),
    [picturesInput]
  );

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.time) - new Date(b.time)),
    [events]
  );

  const normalizeDate = (value) => {
    if (!value) return "";
    // Ensure a full datetime string for consistent sorting/storage
    return `${value}T00:00:00`;
  };

  const addPictures = (list) => {
    const current = picturesList;
    const merged = [...current, ...list].filter(Boolean);
    const deduped = Array.from(new Set(merged));
    setPicturesInput(deduped.join("\n"));
  };

  const removePictureAt = (idx) => {
    setPicturesInput(picturesList.filter((_, i) => i !== idx).join("\n"));
  };

  const handleFiles = async (files) => {
    const urls = [];
    for (const file of files) {
      if (!file.type.startsWith("image")) continue;
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      urls.push(dataUrl);
    }
    if (urls.length) addPictures(urls);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDropActive(false);
    setStatus("");

    const dt = e.dataTransfer;
    const files = Array.from(dt.files || []);
    if (files.length) {
      await handleFiles(files);
      return;
    }

    const urlCandidates = [];
    for (const item of dt.items || []) {
      if (item.kind === "string") {
        const text = await new Promise((resolve) =>
          item.getAsString((s) => resolve(s))
        );
        urlCandidates.push(text);
      }
    }
    if (urlCandidates.length) {
      addPictures(urlCandidates);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setStatus("");
    if (!name || !time) {
      setStatus("Name and time are required.");
      return;
    }
    setBusy(true);
    const newEvent = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now(),
      name,
      description,
      time: normalizeDate(time),
      pictures: parsePictures(picturesInput),
    };

    setEvents((prev) => [...prev, newEvent]);
    setName("");
    setDescription("");
    setTime("");
    setPicturesInput("");
    setStatus("Added event (saved locally).");
    setBusy(false);
  };

  const handleDelete = async (id) => {
    setStatus("");
    setBusy(true);
    setEvents((prev) => prev.filter((evt) => (evt.id ?? evt.time) !== id));
    setStatus("Deleted event (local only).");
    setBusy(false);
  };

  return (
    <section className="admin-panel" aria-label="Manage events">
      <div className="admin-header">
        <h3>Manage events</h3>
        <p className="admin-hint">Data is stored locally in your browser.</p>
      </div>
      <form className="admin-form" onSubmit={handleAdd}>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </label>
        <label>
          Date
          <input
            type="date"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />
        </label>
        <label>
          Pictures
          <div
            className={`dropzone ${dropActive ? "dropzone-active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={handleDrop}
          >
            <p className="dropzone-text">
              Drag & drop images or URLs, or
              <button
                type="button"
                className="link-button"
                onClick={() => fileInputRef.current?.click()}
              >
                browse files
              </button>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                handleFiles(files);
                e.target.value = "";
              }}
            />
            <p className="dropzone-hint">
              {picturesList.length
                ? `${picturesList.length} image${
                    picturesList.length > 1 ? "s" : ""
                  } added.`
                : "URLs dropped will be added automatically."}
            </p>
            {picturesList.length ? (
              <div className="thumb-grid" aria-live="polite">
                {picturesList.map((src, idx) => (
                  <div
                    key={`${idx}-${src.slice(0, 12)}`}
                    className="thumb-item"
                  >
                    <img src={src} alt={`pic-${idx + 1}`} loading="lazy" />
                    <button
                      type="button"
                      className="thumb-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        removePictureAt(idx);
                      }}
                      aria-label={`Remove image ${idx + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="thumb-clear"
                  onClick={() => setPicturesInput("")}
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Add event"}
        </button>
        {status ? <p className="admin-status">{status}</p> : null}
      </form>

      <div className="admin-list">
        <h4>Existing events</h4>
        {!sortedEvents.length ? <p>No events yet.</p> : null}
        <ul>
          {sortedEvents.map((evt) => (
            <li key={evt.id ?? evt.time} className="admin-event-item">
              <div>
                <strong>{evt.name}</strong>
                <div className="admin-event-meta">
                  {new Date(evt.time).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(evt.id ?? evt.time)}
                disabled={busy}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
