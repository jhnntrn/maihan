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

async function fileToOptimizedPicture(file) {
  const dataUrl = await fileToOptimizedDataUrl(file);
  if (!dataUrl) return null;
  return dataUrl;
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
  picturesInput,
  setPicturesInput,
  notify,
  setBusy,
  busy,
  onPreview,
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
    const urls = [];
    try {
      for (const file of files) {
        const picture = await fileToOptimizedPicture(file);
        if (picture) urls.push(picture);
      }

      if (urls.length) {
        addPictures(urls);
        notify(
          `Prepared ${urls.length} image${urls.length === 1 ? "" : "s"} for upload.`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setDropActive(false);

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
              <button
                type="button"
                className="thumb-preview"
                onClick={() => onPreview(src)}
                aria-label={`Preview image ${idx + 1}`}
              >
                <img src={src} alt={`pic-${idx + 1}`} loading="lazy" />
              </button>
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

function EventSummary({ event, onPreview }) {
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
            <button
              key={`${src.slice(0, 24)}-${idx}`}
              type="button"
              className="admin-thumb-preview"
              onClick={() => onPreview(src)}
              aria-label={`Preview ${event.name} image ${idx + 1}`}
            >
              <img src={src} alt="" />
            </button>
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
  event,
  busy,
  setBusy,
  notify,
  onPreview,
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

    if (!name || !time) {
      notify("Name and time are required.", "error");
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
        <input
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label>
        Pictures
        <PictureEditor
          picturesInput={picturesInput}
          setPicturesInput={setPicturesInput}
          notify={notify}
          setBusy={setBusy}
          busy={busy}
          onPreview={onPreview}
          compact
        />
      </label>
      <div className="admin-event-actions">
        <button type="submit" className="button-save" disabled={busy}>
          Save
        </button>
        <button
          type="button"
          className="button-cancel"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button-danger"
          onClick={onDelete}
          disabled={busy}
        >
          Delete
        </button>
      </div>
    </form>
  );
}

function LoveNotesEditor({ loveNotes, setLoveNotes, notify = () => {} }) {
  const normalizedNotes = Array.isArray(loveNotes) ? loveNotes : [];

  const updateNote = (index, value) => {
    setLoveNotes(
      normalizedNotes.map((note, noteIndex) =>
        noteIndex === index ? value : note
      )
    );
  };

  const addNote = () => {
    setLoveNotes([...normalizedNotes, ""]);
    notify("Added love note to preview. Save preview to write it to Blob.");
  };

  const deleteNote = (index) => {
    const confirmed = window.confirm(
      "Delete this love note from the preview? Save preview to write this change to Blob."
    );
    if (!confirmed) return;

    setLoveNotes(normalizedNotes.filter((_, noteIndex) => noteIndex !== index));
    notify("Deleted love note from preview. Save preview to write it to Blob.");
  };

  const cleanNotes = () => {
    const nextNotes = normalizedNotes
      .map((note) => note.trim())
      .filter(Boolean);
    setLoveNotes(nextNotes);
    notify(`Cleaned love notes. ${nextNotes.length} note${nextNotes.length === 1 ? "" : "s"} remain.`);
  };

  return (
    <section className="admin-panel love-notes-panel" aria-label="Manage love notes">
      <div className="love-notes-toolbar">
        <button type="button" className="button-save" onClick={addNote}>
          Add note
        </button>
        <button type="button" className="button-cancel" onClick={cleanNotes}>
          Clean empty notes
        </button>
      </div>

      <ul className="love-notes-list">
        {normalizedNotes.map((note, index) => (
          <li key={`love-note-${index}`} className="love-note-item">
            <span className="love-note-index">{index + 1}</span>
            <input
              type="text"
              value={note}
              onChange={(event) => updateNote(index, event.target.value)}
              aria-label={`Love note ${index + 1}`}
            />
            <button
              type="button"
              className="button-danger"
              onClick={() => deleteNote(index)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {!normalizedNotes.length ? (
        <p className="admin-hint">No love notes yet. Add one above.</p>
      ) : null}
    </section>
  );
}

export default function EventAdmin({
  events,
  setEvents,
  loveNotes = [],
  setLoveNotes = () => {},
  notify = () => {},
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState("");
  const [picturesInput, setPicturesInput] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

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

  const handleAdd = async (event) => {
    event.preventDefault();

    if (!name || !time) {
      notify("Name and time are required.", "error");
      return;
    }

    const nextEvent = {
      id: createEventId(),
      name,
      description,
      time: normalizeDate(time),
      pictures: picturesList,
    };

    setEvents([...events, nextEvent]);
    resetAddForm();
    notify("Added event to preview. Save preview to write it to Blob.");
  };

  const handleSave = (nextEvent) => {
    const nextEvents = events.map((event) =>
      eventKey(event) === editingId
        ? { ...nextEvent, id: editingId }
        : event
    );
    setEditingId(null);
    setEvents(nextEvents);
    notify("Updated event in preview. Save preview to write it to Blob.");
  };

  const handleDelete = (id) => {
    const confirmed = window.confirm(
      "Delete this event from the preview? Save preview to write this change to Blob."
    );
    if (!confirmed) return;

    const nextEvents = events.filter((event) => eventKey(event) !== id);
    if (editingId === id) setEditingId(null);
    setEvents(nextEvents);
    notify("Deleted event from preview. Save preview to write it to Blob.");
  };

  return (
    <div className="admin-accordion">
      <details className="admin-accordion-item" open>
        <summary>
          <span>
            <strong>Love notes</strong>
            <small>Rotating notes shown on the main page.</small>
          </span>
        </summary>
        <LoveNotesEditor
          loveNotes={loveNotes}
          setLoveNotes={setLoveNotes}
          notify={notify}
        />
      </details>

      <details className="admin-accordion-item" open>
        <summary>
          <span>
            <strong>Manage events</strong>
            <small>Edits stay as preview until you save them.</small>
          </span>
        </summary>
        <section className="admin-panel events-panel" aria-label="Manage events">

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
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
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
              picturesInput={picturesInput}
              setPicturesInput={setPicturesInput}
              notify={notify}
              setBusy={setBusy}
              busy={busy}
              onPreview={setPreviewImage}
            />
          </label>
          <button type="submit" className="button-save" disabled={busy}>
            {busy ? "Preparing..." : "Add event"}
          </button>
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
                    event={event}
                    busy={busy}
                    setBusy={setBusy}
                    notify={notify}
                    onPreview={setPreviewImage}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => handleDelete(id)}
                    onSave={handleSave}
                  />
                ) : (
                  <>
                    <EventSummary event={event} onPreview={setPreviewImage} />
                    <div className="admin-event-actions">
                      <button
                        type="button"
                        className="button-edit"
                        onClick={() => {
                          setEditingId(id);
                        }}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button-danger"
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
      {previewImage ? (
        <div
          className="photo-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Preview image"
          onClick={() => setPreviewImage(null)}
        >
          <div className="photo-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="photo-modal-close"
              onClick={() => setPreviewImage(null)}
              aria-label="Close preview"
            >
              ×
            </button>
            <img src={previewImage} alt="" />
          </div>
        </div>
      ) : null}
      </section>
      </details>
    </div>
  );
}
