import { useEffect, useRef, useState } from "react";
import { motion, useAnimation, useInView } from "framer-motion";

export default function Event({ event, idx, variants, onOpen }) {
  const cardRef = useRef(null);
  const inView = useInView(cardRef, {
    margin: "0px 0px -10% 0px",
    amount: 0.45,
  });

  const photosStripRef = useRef(null);
  const [loopDistance, setLoopDistance] = useState(400);
  const glideControls = useAnimation();
  const [isPaused, setIsPaused] = useState(false);

  const photos = event.pictures ?? [];
  const basePhotos = (() => {
    if (!photos.length) return [];
    if (photos.length >= 4) return photos;
    const repeats = Math.ceil(4 / photos.length);
    return Array.from({ length: repeats }, () => photos)
      .flat()
      .slice(0, 4);
  })();

  const loopedPhotos = basePhotos.length ? [...basePhotos, ...basePhotos] : [];
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
      // Pause without snapping back to 0 to avoid jitter on hover; reset only when offscreen
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

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(event);
    }
  };

  return (
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
      whileHover={{
        scale: 1.02,
        y: -4,
        boxShadow: "0 18px 38px rgba(0,0,0,0.35)",
      }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onOpen(event)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="timeline-dot" aria-hidden="true" />
      <div className="timeline-line" aria-hidden="true" />
      <div className="timeline-meta">
        <p className="event-date">
          {new Date(event.time).toLocaleString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
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
              />
            ))}
          </motion.div>
        </div>
      ) : null}
    </motion.article>
  );
}
