import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useAnimation,
  useInView,
  useMotionValue,
} from "motion/react";

const STRIP_COPIES = 3;
const PHOTO_SPEED_PX_PER_SECOND = 20;

export default function Event({
  event,
  idx,
  variants,
  reduceMotion = false,
  locale,
  copy,
  mobileLightMotion = false,
}) {
  const cardRef = useRef(null);
  const inView = useInView(cardRef, {
    margin: "0px 0px -10% 0px",
    amount: 0.45,
  });
  const [hasEntered, setHasEntered] = useState(false);

  const photosStripRef = useRef(null);
  const [loopDistance, setLoopDistance] = useState(400);
  const glideControls = useAnimation();
  const [isPaused, setIsPaused] = useState(false);
  const resumeTimeout = useRef(null);
  const x = useMotionValue(0);
  const [activePhoto, setActivePhoto] = useState(null);
  const hasLoopStarted = useRef(false);

  const basePhotos = useMemo(() => {
    const photos = Array.isArray(event.pictures) ? event.pictures : [];
    if (!photos.length) return [];
    if (photos.length >= 4) return photos;
    const repeats = Math.ceil(4 / photos.length);
    return Array.from({ length: repeats }, () => photos)
      .flat()
      .slice(0, 4);
  }, [event.pictures]);

  const direction = event.side === "left" ? 1 : -1;

  const loopedPhotos = useMemo(() => {
    if (!basePhotos.length) return [];
    return Array.from({ length: STRIP_COPIES }, () => basePhotos).flat();
  }, [basePhotos]);

  useEffect(() => {
    if (!basePhotos.length) return undefined;
    const measure = () => {
      const strip = photosStripRef.current;
      if (!strip) return;
      const distance = (strip.scrollWidth || 0) / STRIP_COPIES;
      setLoopDistance(distance);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const ro = new ResizeObserver(() => measure());
    ro.observe(photosStripRef.current);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [basePhotos.length]);

  useEffect(() => {
    if (inView) setHasEntered(true);
  }, [inView]);

  useEffect(
    () => () => {
      if (resumeTimeout.current) {
        clearTimeout(resumeTimeout.current);
      }
    },
    []
  );

  const glideDuration =
    loopDistance > 0 ? loopDistance / PHOTO_SPEED_PX_PER_SECOND : 12;


  // Ensure initial position sits at the seam so the first frame has no leading gap
  useEffect(() => {
    if (!basePhotos.length || loopDistance <= 0) return;
    const startX = direction === 1 ? -loopDistance : 0;
    glideControls.set({ x: startX });
    x.set(startX);
    hasLoopStarted.current = false;
  }, [
    basePhotos.length,
    direction,
    glideControls,
    loopDistance,
    x,
  ]);

  useEffect(() => {
    if (reduceMotion) return;
    if (!basePhotos.length || loopDistance <= 0) return;
    const startX = direction === 1 ? -loopDistance : 0;
    const endX = direction === 1 ? 0 : -loopDistance;
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);

    if (inView && !isPaused) {
      const current = x.get();
      // Force the first run to start at the seam, otherwise a stale 0 would shorten the duration.
      let bounded = hasLoopStarted.current
        ? Math.max(minX, Math.min(maxX, current))
        : startX;
      hasLoopStarted.current = true;

      const totalDist = Math.abs(endX - startX) || 1;
      const remainingDist = Math.abs(endX - bounded);
      const frac = Math.max(0.01, Math.min(1, remainingDist / totalDist));

      glideControls.set({ x: bounded });
      x.set(bounded);
      glideControls.start({
        x: [bounded, endX],
        transition: {
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
          duration: glideDuration * frac,
          times: [0, 1],
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
    isPaused,
    loopDistance,
    reduceMotion,
    x,
  ]);

  const pauseGlide = () => {
    setIsPaused(true);
    glideControls.stop();
    x.set(x.get()); // freeze at current offset
  };

  const resumeGlide = (delay = 0) => {
    if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
    resumeTimeout.current = setTimeout(() => {
      setIsPaused(false);
    }, delay);
  };

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
              aria-label={copy?.closePhoto || "Close photo"}
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
        initial={reduceMotion || mobileLightMotion ? false : "hidden"}
        animate={
          reduceMotion || mobileLightMotion
            ? undefined
            : inView
            ? "visible"
            : "hidden"
        }
        transition={
          reduceMotion || mobileLightMotion
            ? undefined
            : {
                delay: inView ? Math.min(idx * 0.08, 0.45) : 0,
              }
        }
        style={
          mobileLightMotion
            ? {
                opacity: hasEntered ? 1 : 0,
                transform: hasEntered
                  ? "translate3d(0, 0, 0)"
                  : `translate3d(${event.side === "left" ? -18 : 18}px, 0, 0)`,
                transition: "opacity 240ms ease, transform 240ms ease",
              }
            : undefined
        }
      >
        <div className="timeline-dot" aria-hidden="true" />
        <div className="timeline-line" aria-hidden="true" />
        <div className="timeline-meta">
          <p className="event-date">
            {new Date(event.time).toLocaleString(locale, {
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
              animate={reduceMotion ? undefined : glideControls}
              onMouseEnter={pauseGlide}
              onMouseLeave={() => resumeGlide(0)}
              onFocus={pauseGlide}
              onBlur={() => resumeGlide(0)}
              drag="x"
              dragElastic={0.08}
              onDragStart={() => pauseGlide()}
              onDragEnd={(_, info) => {
                if (!loopDistance) {
                  resumeGlide(0);
                  return;
                }
                const rangeStart = -loopDistance;
                const rangeEnd = 0;
                const span = Math.abs(rangeEnd - rangeStart) || 1;
                const wrap = (val) => {
                  const raw = (((val - rangeStart) % span) + span) % span;
                  return rangeStart + raw;
                };
                const delta = info?.delta?.x ?? 0;
                const current = x.get() + delta;
                const normalized = wrap(current);
                glideControls.stop();
                glideControls.set({ x: normalized });
                x.set(normalized);
                hasLoopStarted.current = true;
                resumeGlide(0);
              }}
              style={{ touchAction: "pan-y", x }}
            >
              {loopedPhotos.map((src, i) => (
                <button
                  key={`${event.time}-${i}`}
                  type="button"
                  className="event-photo-button"
                  onClick={() => openPhoto(src)}
                  aria-label={`${event.name} photo ${i + 1}`}
                >
                  <img src={src} alt="" loading="lazy" draggable="false" />
                </button>
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
