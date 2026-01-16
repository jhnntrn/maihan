import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useAnimation,
  useInView,
  useMotionValue,
} from "framer-motion";

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
  const [glideDuration, setGlideDuration] = useState(12);
  const glideControls = useAnimation();
  const [isPaused, setIsPaused] = useState(false);
  const resumeTimeout = useRef(null);
  const x = useMotionValue(0);
  const [activePhoto, setActivePhoto] = useState(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(pointer: coarse)").matches
      : false
  );

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

  useEffect(() => {
    if (reduceMotion) {
      // Keep strip static when reduced motion is requested (mobile/OS pref)
      glideControls.stop();
      x.set(0);
    }
  }, [reduceMotion, glideControls, x]);

  useEffect(() => {
    if (mobileLightMotion) {
      setHasEntered(inView);
    }
  }, [mobileLightMotion, inView]);

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
    const mq = window.matchMedia("(pointer: coarse)");
    const onPointerChange = () => setIsCoarsePointer(mq.matches);
    mq.addEventListener("change", onPointerChange);
    return () => {
      window.removeEventListener("resize", measure);
      mq.removeEventListener("change", onPointerChange);
      if (resumeTimeout.current) {
        clearTimeout(resumeTimeout.current);
      }
    };
  }, [basePhotos.length]);

  useEffect(() => {
    if (loopDistance <= 0) return;
    const pxPerSecond = 20; // target constant speed
    const duration = loopDistance / pxPerSecond;
    setGlideDuration(duration);
  }, [loopDistance]);

  // Ensure initial position sits at the seam so the first frame has no leading gap
  useEffect(() => {
    if (!basePhotos.length || loopDistance <= 0) return;
    const startX = direction === 1 ? -loopDistance : loopDistance;
    glideControls.set({ x: startX });
    x.set(startX);
  }, [basePhotos.length, loopDistance, direction, glideControls, x]);

  useEffect(() => {
    if (reduceMotion) return;
    if (!basePhotos.length || loopDistance <= 0) return;
    const startX = direction === 1 ? -loopDistance : loopDistance;
    const endX = 0;

    if (inView && !isPaused) {
      const current = x.get();
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      let bounded = Math.max(minX, Math.min(maxX, current));

      // On first run (fresh mount), start at the seam for a seamless loop
      if (Math.abs(bounded) < 1e-3) {
        bounded = startX;
      }

      const totalDist = Math.abs(endX - startX) || 1;
      const remainingDist = Math.abs(endX - bounded);
      const remainingFrac = Math.max(
        0.01,
        Math.min(1, remainingDist / totalDist)
      );
      const remainingDuration = glideDuration * remainingFrac;

      glideControls.set({ x: bounded });
      x.set(bounded);
      glideControls.start({
        x: [bounded, endX],
        transition: {
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
          duration: remainingDuration,
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
    x,
    reduceMotion,
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
              drag={isCoarsePointer ? "x" : false}
              dragElastic={isCoarsePointer ? 0.08 : undefined}
              onDragStart={isCoarsePointer ? () => pauseGlide() : undefined}
              onDragEnd={
                isCoarsePointer
                  ? (_, info) => {
                      if (!loopDistance) {
                        resumeGlide(0);
                        return;
                      }
                      const dist = loopDistance;
                      const wrap = (val) => {
                        const raw = ((val % dist) + dist) % dist;
                        if (direction === 1) {
                          return raw === 0 ? 0 : raw - dist; // range [-dist, 0)
                        }
                        return raw === 0 ? 0 : raw; // range [0, dist)
                      };
                      const deltaX = info?.delta?.x ?? 0;
                      const current = x.get() + deltaX;
                      const normalized = wrap(current);
                      glideControls.stop();
                      glideControls.set({ x: normalized });
                      x.set(normalized);
                      resumeGlide(0);
                    }
                  : undefined
              }
              style={{ touchAction: "pan-y", x }}
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
