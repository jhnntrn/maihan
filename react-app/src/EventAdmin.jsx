import { useMemo, useRef, useState } from "react";

const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_QUALITY = 0.82;
const IMAGE_OUTPUT_TYPE = "image/jpeg";

function parsePictures(input) {
  if (!input.trim()) return [];
  return input
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function picturesToInput(pictures) {
  return (pictures || []).join("\n");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };
    image.src = url;
  });
}

function canvasToDataUrl(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          resolve(canvas.toDataURL(type, quality));
          return;
        }
        resolve(await readFileAsDataUrl(blob));
      },
      type,
      quality
    );
  });
}

async function fileToOptimizedDataUrl(file) {
  if (!file.type.startsWith("image/")) return null;

  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return readFileAsDataUrl(file);
  }

  try {
    const image = await loadImage(file);
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale =
      largestSide > IMAGE_MAX_DIMENSION ? IMAGE_MAX_DIMENSION / largestSide : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      return readFileAsDataUrl(file);
    }

    context.drawImage(image, 0, 0, width, height);
    return canvasToDataUrl(canvas, IMAGE_OUTPUT_TYPE, IMAGE_QUALITY);
  } catch {
    return readFileAsDataUrl(file);
  }
}

async function uploadImageDataUrl(dataUrl, filename, adminSecret) {
  if (!adminSecret) {
    throw new Error("Admin secret is missing.");
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

async function fileToOptimizedPicture(file, adminSecret) {
  const dataUrl = await fileToOptimizedDataUrl(file);
  if (!dataUrl) return null;

  try {
    const blob = await uploadImageDataUrl(dataUrl, file.name, adminSecret);
    return { src: blob.url, uploaded: true };
  } catch {
    return { src: dataUrl, uploaded: false };
  }
}

function compareEventsByTime(a, b) {
  return Date.parse(a.time) - Date.parse(b.time);
}

function eventKey(event) {
  return event.id ?? event.time;
}

function dateInputValue(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function createEventId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return String(Date.now());
}

function normalizeDate(value) {
  if (!value) return "";
  return `${value}T00:00:00`;
}

function mergePictures(current, next) {
  return Array.from(new Set([...current, ...next].filter(Boolean)));
}

function PictureEditor({
  adminSecret,
  picturesInput,
  setPicturesInput,
  setStatus,
  setBusy,
  busy,
  compact = false,
}) {
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef(null);
  const picturesList = useMemo(
    () => parsePictures(picturesInput),
    [picturesInput]
  );

  const addPictures = (list) => {
    setPicturesInput(mergePictures(picturesList, list).join("\n"));
  };

  const removePictureAt = (idx) => {
    setPicturesInput(picturesList.filter((_, i) => i !== idx).join("\n"));
  };

  const handleFiles = async (files) => {
    setBusy(true);
    setStatus("");
    const urls = [];
    let uploadFailures = 0;
    try {
      for (const file of files) {
        const picture = await fileToOptimizedPicture(file, adminSecret);
        if (picture?.src) {
          urls.push(picture.src);
          if (!picture.uploaded) uploadFailures += 1;
        }
      }

      if (urls.length) {
        addPictures(urls);
        const uploadNote = uploadFailures
          ? ` ${uploadFailures} image${uploadFailures === 1 ? "" : "s"} stayed local because Blob upload failed.`
          : "";
        setStatus(
          `Added ${urls.length} image${urls.length === 1 ? "" : "s"}.${uploadNote}`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setDropActive(false);
    setStatus("");

    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) {
      await handleFiles(files);
      return;
    }

    const urlCandidates = [];
    for (const item of event.dataTransfer.items || []) {
      if (item.kind === "string") {
        const text = await new Promise((resolve) =>
          item.getAsString((value) => resolve(value))
        );
        urlCandidates.push(text);
      }
    }
    if (urlCandidates.length) addPictures(urlCandidates);
  };

  return (
    <div
      className={`dropzone ${dropActive ? "dropzone-active" : ""} ${
        compact ? "dropzone-compact" : ""
      }`}
      onDragOver={(event) => {
        event.preventDefault();
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
          disabled={busy}
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
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          handleFiles(files);
          event.target.value = "";
        }}
      />
      <p className="dropzone-hint">
        {picturesList.length
          ? `${picturesList.length} image${
              picturesList.length > 1 ? "s" : ""
            } added. New image files are compressed before preview.`
          : "Drop image files or paste one image URL per line."}
      </p>
      {picturesList.length ? (
        <div className="thumb-grid" aria-live="polite">
          {picturesList.map((src, idx) => (
            <div key={`${idx}-${src.slice(0, 24)}`} className="thumb-item">
              <img src={src} alt={`pic-${idx + 1}`} loading="lazy" />
              <button
                type="button"
                className="thumb-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
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
            disabled={busy}
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EventSummary({ event }) {
  const pictures = event.pictures || [];

  return (
    <div className="admin-event-summary">
      <strong>{event.name}</strong>
      <div className="admin-event-meta">
        {new Date(event.time).toLocaleString()}
      </div>
      {event.description ? (
        <p className="admin-event-description">{event.description}</p>
      ) : null}
      {pictures.length ? (
        <div className="admin-event-thumbs">
          {pictures.slice(0, 5).map((src, idx) => (
            <img key={`${src.slice(0, 24)}-${idx}`} src={src} alt="" />
          ))}
          {pictures.length > 5 ? <span>+{pictures.length - 5}</span> : null}
        </div>
      ) : (
        <p className="admin-event-meta">No pictures.</p>
      )}
    </div>
  );
}

function InlineEventEditor({
  adminSecret,
  event,
  busy,
  setBusy,
  setStatus,
  onCancel,
  onDelete,
  onSave,
}) {
  const [name, setName] = useState(event.name || "");
  const [description, setDescription] = useState(event.description || "");
  const [time, setTime] = useState(dateInputValue(event.time));
  const [picturesInput, setPicturesInput] = useState(
    picturesToInput(event.pictures)
  );
  const picturesList = useMemo(
    () => parsePictures(picturesInput),
    [picturesInput]
  );

  const handleSubmit = (submitEvent) => {
    submitEvent.preventDefault();
    setStatus("");

    if (!name || !time) {
      setStatus("Name and time are required.");
      return;
    }

    onSave({
      ...event,
      name,
      description,
      time: normalizeDate(time),
      pictures: picturesList,
    });
  };

  return (
    <form className="admin-inline-form" onSubmit={handleSubmit}>
      <div className="admin-inline-fields">
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label>
          Date
          <input
            type="date"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            required
          />
        </label>
      </div>
      <label>
        Description
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
        />
      </label>
      <label>
        Pictures
        <PictureEditor
          adminSecret={adminSecret}
          picturesInput={picturesInput}
          setPicturesInput={setPicturesInput}
          setStatus={setStatus}
          setBusy={setBusy}
          busy={busy}
          compact
        />
      </label>
      <div className="admin-event-actions">
        <button type="submit" className="admin-secondary-button" disabled={busy}>
          Save
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </form>
  );
}

export default function EventAdmin({
  adminSecret,
  events,
  onSaveEvents,
  setEvents,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState("");
  const [picturesInput, setPicturesInput] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const picturesList = useMemo(
    () => parsePictures(picturesInput),
    [picturesInput]
  );

  const sortedEvents = useMemo(
    () => [...events].sort(compareEventsByTime),
    [events]
  );

  const resetAddForm = () => {
    setName("");
    setDescription("");
    setTime("");
    setPicturesInput("");
  };

  const commitEvents = async (nextEvents, successMessage) => {
    setBusy(true);
    try {
      if (onSaveEvents) {
        await onSaveEvents(nextEvents);
      } else {
        setEvents(nextEvents);
      }
      setStatus(successMessage);
    } catch (error) {
      setEvents(nextEvents);
      setStatus(
        `${successMessage} Browser preview updated, but Blob save failed: ${error.message}`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    setStatus("");

    if (!name || !time) {
      setStatus("Name and time are required.");
      return;
    }

    const nextEvent = {
      id: createEventId(),
      name,
      description,
      time: normalizeDate(time),
      pictures: picturesList,
    };

    const nextEvents = [...events, nextEvent];
    resetAddForm();
    await commitEvents(nextEvents, "Added event and saved to Blob.");
  };

  const handleSave = async (nextEvent) => {
    const nextEvents = events.map((event) =>
        eventKey(event) === editingId ? { ...nextEvent, id: editingId } : event
    );
    setEditingId(null);
    await commitEvents(nextEvents, "Updated event and saved to Blob.");
  };

  const handleDelete = async (id) => {
    const nextEvents = events.filter((event) => eventKey(event) !== id);
    if (editingId === id) setEditingId(null);
    await commitEvents(nextEvents, "Deleted event and saved to Blob.");
  };

  return (
    <section className="admin-panel" aria-label="Manage events">
      <div className="admin-header">
        <h3>Manage events</h3>
        <p className="admin-hint">Data is stored locally in your browser.</p>
      </div>

      <form className="admin-form" onSubmit={handleAdd}>
        <div className="admin-edit-state">
          <strong>New event</strong>
        </div>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />
        </label>
        <label>
          Date
          <input
            type="date"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            required
          />
        </label>
        <label>
          Pictures
          <PictureEditor
            adminSecret={adminSecret}
            picturesInput={picturesInput}
            setPicturesInput={setPicturesInput}
            setStatus={setStatus}
            setBusy={setBusy}
            busy={busy}
          />
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
          {sortedEvents.map((event) => {
            const id = eventKey(event);
            const isEditing = editingId === id;

            return (
              <li
                key={id}
                className={`admin-event-item ${
                  isEditing ? "admin-event-active" : ""
                }`}
              >
                {isEditing ? (
                  <InlineEventEditor
                    adminSecret={adminSecret}
                    event={event}
                    busy={busy}
                    setBusy={setBusy}
                    setStatus={setStatus}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => handleDelete(id)}
                    onSave={handleSave}
                  />
                ) : (
                  <>
                    <EventSummary event={event} />
                    <div className="admin-event-actions">
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={() => {
                          setEditingId(id);
                          setStatus("");
                        }}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(id)}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
