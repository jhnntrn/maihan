import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useAnimation,
  useInView,
} from "framer-motion";

export default function Event({ event, idx, variants }) {
  const cardRef = useRef(null);
  const inView = useInView(cardRef, {
    margin: "0px 0px -10% 0px",
    amount: 0.45,
  });

  const photosStripRef = useRef(null);
  const [loopDistance, setLoopDistance] = useState(400);
  const glideControls = useAnimation();
  const [isPaused, setIsPaused] = useState(false);
  const [activePhoto, setActivePhoto] = useState(null);

  const photos = event.pictures ?? [];
  const basePhotos = useMemo(() => {
    if (!photos.length) return [];
    if (photos.length >= 4) return photos;
    const repeats = Math.ceil(4 / photos.length);
    return Array.from({ length: repeats }, () => photos)
      .flat()
      .slice(0, 4);
  }, [photos]);

  const loopedPhotos = useMemo(
    () => (basePhotos.length ? [...basePhotos, ...basePhotos] : []),
    [basePhotos]
  );
  const direction = event.side === "left" ? 1 : -1;
  const baseDuration = Math.max(8, basePhotos.length * 3 || 8);
  const speedFactor = direction === 1 ? 2 : 0.7; // left slower, right faster
  const glideDuration = baseDuration * speedFactor;

  useEffect(() => {
    if (!photosStripRef.current) return undefined;

    const measure = () => {
      const el = photosStripRef.current;
      if (!el) return;
      const width = el.scrollWidth / 2; // half because we duplicate
      if (width > 0) setLoopDistance(width);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [basePhotos.length]);

  useEffect(() => {
    if (!basePhotos.length || loopDistance <= 0) return;
    const startX = direction === 1 ? -loopDistance : loopDistance;
    const endX = 0;

    if (inView && !isPaused) {
      glideControls.set({ x: startX });
      glideControls.start({
        x: [startX, endX],
        transition: {
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
          duration: glideDuration,
        },
      });
    } else {
      glideControls.stop();
      if (!inView) {
        glideControls.set({ x: startX });
      }
    }
  }, [
    basePhotos.length,
    direction,
    glideControls,
    glideDuration,
    inView,
    loopDistance,
    isPaused,
  ]);

  useEffect(() => {
    if (!inView && activePhoto) {
      setActivePhoto(null);
    }
  }, [inView, activePhoto]);

  const openPhoto = (src) => setActivePhoto(src);

  useEffect(() => {
    if (!activePhoto) return undefined;

    const onKey = (e) => {
      if (e.key === "Escape") {
        setActivePhoto(null);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePhoto]);

  const modal = (
    <AnimatePresence>
      {activePhoto ? (
        <motion.div
          className="photo-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`${event.name} photo`}
          onClick={() => setActivePhoto(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <motion.div
            className="photo-modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <button
              type="button"
              className="photo-modal-close"
              onClick={() => setActivePhoto(null)}
              aria-label="Close photo"
            >
              ×
            </button>
            <img src={activePhoto} alt={event.name} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <>
      <motion.article
        className={`timeline-card vertical side-${event.side}`}
        data-event-id={event.time}
        data-event-index={idx}
        ref={cardRef}
        variants={variants}
        custom={event.side}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        transition={{
          delay: inView ? Math.min(idx * 0.08, 0.45) : 0,
        }}
      >
        <div className="timeline-dot" aria-hidden="true" />
        <div className="timeline-line" aria-hidden="true" />
        <div className="timeline-meta">
          <p className="event-date">
            {new Date(event.time).toLocaleString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h3 className="event-name">{event.name}</h3>
        </div>
        <p className="event-desc">{event.description}</p>
        {basePhotos.length ? (
          <div className="event-photos-clip">
            <motion.div
              className="event-photos"
              ref={photosStripRef}
              animate={glideControls}
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onFocus={() => setIsPaused(true)}
              onBlur={() => setIsPaused(false)}
            >
              {loopedPhotos.map((src, i) => (
                <img
                  key={`${event.time}-${i}`}
                  src={src}
                  alt={event.name}
                  loading="lazy"
                  onClick={() => openPhoto(src)}
                />
              ))}
            </motion.div>
          </div>
        ) : null}
      </motion.article>

      {typeof document !== "undefined"
        ? createPortal(modal, document.body)
        : null}
    </>
  );
}
