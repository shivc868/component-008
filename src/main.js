import "./style.css";
import "./demo.css";
import "lenis/dist/lenis.css";
import gsap from "gsap";
import Lenis from "lenis";

// Set to false if the host site runs its own scrolling.
const SMOOTH_SCROLL = true;

if (SMOOTH_SCROLL && !window.lenis) {
  const lenis = new Lenis({ autoRaf: false, anchors: true });
  window.lenis = lenis;
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

const CONFIG = {
  FOLLOW: 0.7,
  FOLLOW_EASE: "power3",
  LABEL_FOLLOW: 0.9,
  BOUND: 0.45, // panel centre stays within this share of the card
  OPEN_FROM: 0.2,
  CLOSE_TO: 0.14, // keep --mfa-panel-shut in step
  OPEN: 0.75,
  OPEN_EASE: "power2.out",
  CLOSE: 0.45,
  CLOSE_EASE: "power2.inOut",
  LABEL_AT: 0.72, // label drops in this far through the open
  LABEL_IN: 0.45,
  LABEL_EASE: "power3.out",
  LABEL_OUT: 0.4,
  PRELOAD_MARGIN: "100px",
};

(function mfaWork() {
  const root = document.querySelector(".mfa-work");
  if (!root) return;

  const cards = [...root.querySelectorAll(".mfa-work__card")].map((card) => ({
    card,
    cursor: card.querySelector(".mfa-work__cursor"),
    label: card.querySelector(".mfa-work__label"),
    reveal: card.querySelector(".mfa-work__reveal"),
    video: card.querySelector(".mfa-work__video"),
  }));
  if (!cards.length) return;

  function attachSrc(video) {
    if (!video.src) video.src = video.dataset.mfaSrc;
  }

  const loader = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        attachSrc(entry.target.querySelector(".mfa-work__video"));
        loader.unobserve(entry.target);
      }
    },
    { rootMargin: CONFIG.PRELOAD_MARGIN },
  );

  cards.forEach(({ card }) => loader.observe(card));

  function positionFor(event, item) {
    const rect = item.card.getBoundingClientRect();
    // offsetWidth, not the rect: the panel carries a transform of its own
    const panelW = item.cursor.offsetWidth;
    const panelH = item.cursor.offsetHeight;

    const mx = gsap.utils.clamp(0, 1, (event.clientX - rect.left) / rect.width);
    const my = gsap.utils.clamp(0, 1, (event.clientY - rect.top) / rect.height);

    // half the panel comes off the bound so its edge, not its centre, respects it
    const maxX = Math.max(0, CONFIG.BOUND * rect.width - panelW / 2);
    const maxY = Math.max(0, CONFIG.BOUND * rect.height - panelH / 2);
    const maxLabelX = Math.max(0, panelW - item.label.offsetWidth);

    return {
      x: gsap.utils.interpolate(-maxX, maxX, mx),
      y: gsap.utils.interpolate(-maxY, maxY, my),
      labelX: gsap.utils.interpolate(0, maxLabelX, mx),
    };
  }

  function wire(item) {
    const { card, cursor, label, reveal, video } = item;

    // The window scales up while the video scales down by the same factor, so
    // the frame opens without the picture inside it moving.
    const aperture = { open: CONFIG.CLOSE_TO };

    function applyWindow() {
      gsap.set(reveal, { scale: aperture.open });
      gsap.set(video, { scale: 1 / aperture.open });
    }

    const xTo = gsap.quickTo(cursor, "x", {
      duration: CONFIG.FOLLOW,
      ease: CONFIG.FOLLOW_EASE,
    });
    const yTo = gsap.quickTo(cursor, "y", {
      duration: CONFIG.FOLLOW,
      ease: CONFIG.FOLLOW_EASE,
    });
    const labelTo = gsap.quickTo(label, "x", {
      duration: CONFIG.LABEL_FOLLOW,
      ease: CONFIG.FOLLOW_EASE,
    });

    // Kill by property — a blanket kill would take the quickTo tweens with it.
    function stopTweens() {
      gsap.killTweensOf(label, "opacity,yPercent");
      gsap.killTweensOf(reveal, "opacity");
      gsap.killTweensOf(aperture);
    }

    function onEnter(event) {
      const to = positionFor(event, item);

      attachSrc(video);
      video.play().catch(() => {});

      stopTweens();
      gsap.set(cursor, { xPercent: -50, yPercent: -50 });

      // passing the value twice makes quickTo jump instead of glide in
      xTo(to.x, to.x);
      yTo(to.y, to.y);
      labelTo(to.labelX, to.labelX);

      gsap.set(label, { opacity: 1, yPercent: -110 });
      gsap.set(reveal, { opacity: 0 });
      aperture.open = CONFIG.OPEN_FROM;
      applyWindow();

      gsap.to(aperture, {
        open: 1,
        duration: CONFIG.OPEN,
        ease: CONFIG.OPEN_EASE,
        onUpdate: applyWindow,
      });
      gsap.to(reveal, {
        opacity: 1,
        duration: CONFIG.OPEN,
        ease: CONFIG.OPEN_EASE,
      });
      gsap.to(label, {
        yPercent: 0,
        duration: CONFIG.LABEL_IN,
        ease: CONFIG.LABEL_EASE,
        delay: CONFIG.OPEN * CONFIG.LABEL_AT,
      });
    }

    function onMove(event) {
      const to = positionFor(event, item);
      xTo(to.x);
      yTo(to.y);
      labelTo(to.labelX);
    }

    function onLeave() {
      stopTweens();
      gsap.to(label, {
        opacity: 0,
        duration: CONFIG.LABEL_OUT,
        ease: CONFIG.CLOSE_EASE,
      });
      gsap.to(aperture, {
        open: CONFIG.CLOSE_TO,
        duration: CONFIG.CLOSE,
        ease: CONFIG.CLOSE_EASE,
        onUpdate: applyWindow,
      });
      gsap.to(reveal, {
        opacity: 0,
        duration: CONFIG.CLOSE,
        ease: CONFIG.CLOSE_EASE,
        onComplete: () => video.pause(),
      });
    }

    card.addEventListener("mouseenter", onEnter);
    card.addEventListener("mousemove", onMove);
    card.addEventListener("mouseleave", onLeave);

    return () => {
      card.removeEventListener("mouseenter", onEnter);
      card.removeEventListener("mousemove", onMove);
      card.removeEventListener("mouseleave", onLeave);
      xTo.tween.kill();
      yTo.tween.kill();
      labelTo.tween.kill();
      stopTweens();
      video.pause();
    };
  }

  const mm = gsap.matchMedia();

  mm.add(
    "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    () => {
      const unwire = cards.map(wire);
      return () => unwire.forEach((fn) => fn());
    },
  );

  // Hover sticks while the tab is in the background, so stop the clips there.
  function onVisibility() {
    if (document.hidden) cards.forEach(({ video }) => video.pause());
  }

  document.addEventListener("visibilitychange", onVisibility);

  root.mfaDestroy = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    loader.disconnect();
    mm.revert();
  };
})();
