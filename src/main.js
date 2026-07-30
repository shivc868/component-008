import "./style.css";
import "./demo.css"; // showcase page styles only — do NOT copy into your project
import "lenis/dist/lenis.css";
import gsap from "gsap";
import Lenis from "lenis";

/* ---------------------------------------------------------------------------
   WORK — case-study grid with a cursor-following video reveal
   Mounts on .mfa-work in index.html. Nothing here touches the page outside it.
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   Smooth scrolling (optional)

   - Set SMOOTH_SCROLL to false if the host site manages its own scrolling.
   - If the site already runs Lenis (exposed as window.lenis, the common
     convention), that instance is reused — two Lenis instances would fight
     over wheel events and break scrolling.
   - The global GSAP tweaks (ticker driving, lagSmoothing) are applied ONLY
     when this component creates and owns the Lenis instance.
--------------------------------------------------------------------------- */

const SMOOTH_SCROLL = true;

if (SMOOTH_SCROLL && !window.lenis) {
  const lenis = new Lenis({ autoRaf: false, anchors: true });
  window.lenis = lenis; // expose so other scripts (or a second copy) reuse it
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ---------------------------------------------------------------------------
   THE PROJECTS — this is the part you edit.

   One entry per card, in order. Add, remove or reorder them freely; nothing
   else in this file and nothing in index.html needs to change.

     mark    the client wordmark, set in type across the card. Keep it short —
             it never wraps.
     title   the small label that rides above the video under the cursor
     href    where the card goes
     still   the resting photograph, from public/assets/. Swap a card's image
             by replacing the file — the numbering matches the order below and
             no code needs to change. Each file is already cropped to its
             card's shape (work-img-1 is the wide 16:9 one, the rest are
             square), so match that when you replace one or object-fit will
             trim it.
     video   the clip that opens under the cursor. It is cropped to
             --mfa-panel-ratio in style.css, which is portrait — landscape
             footage works, but only the middle of the frame survives, so keep
             the subject centred. Muted autoplay is the only kind browsers
             allow, so use footage that needs no sound.
     wide    true makes the card span both columns
--------------------------------------------------------------------------- */

const PROJECTS = [
  {
    mark: "Noctis",
    title: "Case Study — Noctis",
    href: "#",
    still: "/assets/work-img-1.jpg",
    video: "https://assets.mixkit.co/videos/42230/42230-720.mp4",
    wide: true,
  },
  {
    mark: "Lumen",
    title: "Case Study — Lumen",
    href: "#",
    still: "/assets/work-img-2.jpg",
    video: "https://assets.mixkit.co/videos/4058/4058-720.mp4",
  },
  {
    mark: "Aurora",
    title: "Case Study — Aurora Beauty",
    href: "#",
    still: "/assets/work-img-3.jpg",
    video: "https://assets.mixkit.co/videos/39874/39874-720.mp4",
  },
];

const CONFIG = {
  FOLLOW: 0.8, // seconds the panel lags the cursor — 0 locks it to the pointer
  FOLLOW_EASE: "expo.out",
  // How far the panel's CENTRE may drift from the card's, as a share of the
  // card. 0.4 keeps the panel's edges inside the card's 10%–90% band; raise it
  // and the panel starts running under the card's rounded corners.
  BOUND: 0.45,
  // The video's window, as a scale. 1 is fully open; these are the two shut
  // positions it travels between. OPEN_FROM 0.2 matches the inset(40%) this
  // used to animate — 40% off each side leaves a fifth of the box showing.
  OPEN_FROM: 0.2, // how open the window already is when it starts opening
  CLOSE_TO: 0.14, // and how far it shuts — keep --mfa-panel-shut in step
  OPEN: 0.75, // seconds the window takes to open
  OPEN_EASE: "power2.out",
  CLOSE: 0.45, // and to close
  CLOSE_EASE: "power2.inOut",
  LABEL_IN: 0.2, // the label's fade in…
  LABEL_DELAY: 0.3, // …held back this long, so the video leads and it follows
  LABEL_OUT: 0.4,
  PRELOAD_MARGIN: "100px", // how early a card's video src gets attached
};

(function mfaWork() {
  const root = document.querySelector(".mfa-work");
  if (!root) return;

  const grid = root.querySelector("[data-mfa-grid]");
  const template = root.querySelector("[data-mfa-card]");
  if (!grid || !template) return;

  /* ----- build ----------------------------------------------------------- */

  function buildCard(project) {
    const card = template.content.firstElementChild.cloneNode(true);
    if (project.wide) card.classList.add("mfa-work__card--wide");

    const link = card.querySelector("[data-mfa-link]");
    const still = card.querySelector("[data-mfa-still]");
    const mark = card.querySelector("[data-mfa-mark]");
    const label = card.querySelector("[data-mfa-label]");
    const video = card.querySelector("[data-mfa-video]");

    link.href = project.href || "#";
    label.textContent = project.title;
    still.src = project.still;
    // the first card is the only one above the fold, so it is the only one
    // worth racing the rest for
    still.fetchPriority = project.wide ? "high" : "low";

    if (project.logo) {
      // an image wordmark leaves the link with no text of its own
      const img = document.createElement("img");
      img.src = project.logo;
      img.alt = "";
      mark.replaceChildren(img);
      link.setAttribute("aria-label", project.title);
    } else {
      mark.textContent = project.mark;
    }

    // held off the element until the card nears the viewport; see the observer
    video.dataset.mfaSrc = project.video;

    grid.append(card);

    return {
      card,
      label,
      video,
      cursor: card.querySelector("[data-mfa-cursor]"),
      reveal: card.querySelector("[data-mfa-reveal]"),
    };
  }

  const cards = PROJECTS.map(buildCard);

  /* ----- video loading ---------------------------------------------------
     Three clips is more than any visitor will watch, so none of them is
     fetched until its card is nearly on screen — and a card hovered before
     that happens attaches its own on the spot. */

  function attachSrc(video) {
    if (video.src) return;
    video.src = video.dataset.mfaSrc;
  }

  const loader = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        attachSrc(entry.target.querySelector("[data-mfa-video]"));
        loader.unobserve(entry.target);
      }
    },
    { rootMargin: CONFIG.PRELOAD_MARGIN },
  );

  for (const { card } of cards) loader.observe(card);

  /* ----- geometry --------------------------------------------------------
     Where the panel should sit for a given cursor position, and how far along
     its own window the label should have slid. Both read straight off the
     pointer's 0–1 position across the card, so the panel sweeps the card's
     width while the label sweeps the panel's. */

  function positionFor(event, entry) {
    const { card, cursor, label } = entry;
    const rect = card.getBoundingClientRect();

    // offsetWidth, not the rect: the panel is under a transform of its own and
    // its rect would fold that in
    const panelW = cursor.offsetWidth;
    const panelH = cursor.offsetHeight;

    const mouseX = gsap.utils.clamp(
      0,
      1,
      (event.clientX - rect.left) / rect.width,
    );
    const mouseY = gsap.utils.clamp(
      0,
      1,
      (event.clientY - rect.top) / rect.height,
    );

    // Half the panel is already past its own centre, so the centre has to stop
    // that much short of the bound — otherwise the panel's edge crosses it.
    const maxX = Math.max(0, CONFIG.BOUND * rect.width - panelW / 2);
    const maxY = Math.max(0, CONFIG.BOUND * rect.height - panelH / 2);

    // left-aligned at one end of the panel, right-aligned at the other
    const maxLabelX = Math.max(0, panelW - label.offsetWidth);

    return {
      x: gsap.utils.interpolate(-maxX, maxX, mouseX),
      y: gsap.utils.interpolate(-maxY, maxY, mouseY),
      labelX: gsap.utils.interpolate(0, maxLabelX, mouseX),
    };
  }

  /* ----- hover -----------------------------------------------------------
     Wired up only where there is a real pointer to follow and no request for
     reduced motion. Everywhere else nothing below ever runs, and style.css
     leaves the grid as a plain set of stills. */

  function wire(entry) {
    const { card, cursor, label, reveal, video } = entry;

    /* The window and the picture inside it, driven as one.

       `aperture` is a bare number, and it is what the tweens actually animate;
       the two transforms are written from it on every frame. The indirection
       is what avoids reading a scale back off the element each frame just to
       work out its reciprocal — and it keeps the pair exactly in step, which
       is the whole trick. If they ever drift, the video visibly breathes. */
    const aperture = { open: CONFIG.CLOSE_TO };

    function applyWindow() {
      gsap.set(reveal, { scale: aperture.open });
      gsap.set(video, { scale: 1 / aperture.open });
    }

    function onEnter(event) {
      const to = positionFor(event, entry);

      // Give the media pipeline its head start before the animation begins —
      // a decode landing mid-open is exactly what would show up as a stutter.
      attachSrc(video);
      // a refused play() is not this component's problem to solve — it only
      // means the visitor sees the first frame instead of the clip
      video.play().catch(() => {});

      // A card can be re-entered mid-close. Clearing first means the open
      // starts from a known state instead of blending with the tail of it.
      gsap.killTweensOf([cursor, label, reveal, aperture]);
      gsap.set(cursor, { x: to.x, y: to.y, xPercent: -50, yPercent: -50 });
      gsap.set(label, { x: to.labelX, opacity: 0 });
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
        opacity: 1,
        duration: CONFIG.LABEL_IN,
        delay: CONFIG.LABEL_DELAY,
        ease: "power2.out",
      });
    }

    function onMove(event) {
      const to = positionFor(event, entry);

      gsap.to(cursor, {
        x: to.x,
        y: to.y,
        xPercent: -50,
        yPercent: -50,
        duration: CONFIG.FOLLOW,
        ease: CONFIG.FOLLOW_EASE,
      });
      // overwrite off: the label's opacity tween from onEnter is still running
      // on this element and killing it would swallow the fade in
      gsap.to(label, {
        x: to.labelX,
        duration: CONFIG.FOLLOW,
        ease: CONFIG.FOLLOW_EASE,
        overwrite: false,
      });
    }

    function onLeave() {
      gsap.killTweensOf([cursor, label, reveal, aperture]);
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

  // A hovered card keeps its hover while the tab is in the background, so the
  // clip would otherwise loop on out of sight.
  function onVisibility() {
    if (!document.hidden) return;
    for (const { video } of cards) video.pause();
  }

  document.addEventListener("visibilitychange", onVisibility);

  root.mfaDestroy = function () {
    document.removeEventListener("visibilitychange", onVisibility);
    loader.disconnect();
    mm.revert(); // unwires every card and undoes the tweens' inline styles
    grid.replaceChildren();
  };
})();
