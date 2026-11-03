/**
 * Page-wide behaviour: WhatsApp links follow the visitor's choices, the mobile WhatsApp
 * button stays out of the way, and (after load, on idle) Lenis smooth scrolling +
 * GSAP ScrollTrigger are wired together for wheel/trackpad users.
 */
import { store } from '@/lib/store';
import { quoteMessage, waLink } from '@/lib/whatsapp';
import { idle, reducedMotion } from '@/lib/device';

/* --------------------------------------------- WhatsApp links ← state */
function updateWhatsApp() {
  const s = store.get();
  const quote = waLink(quoteMessage(s));
  const design = waLink(quoteMessage({ ...s, designTouched: true }));
  document.querySelectorAll<HTMLAnchorElement>('[data-wa]').forEach((a) => {
    a.href = a.dataset.wa === 'design' ? design : quote;
  });
}
store.subscribe(updateWhatsApp);
updateWhatsApp();

/* --------------------------------------------- floating WhatsApp (mobile) */
const fab = document.querySelector<HTMLElement>('[data-fab]');
if (fab) {
  const blockers = new Set<Element>();
  const watched = ['#top', '#design .cfg__panel', '#contact', '.ft']
    .map((sel) => document.querySelector(sel))
    .filter((el): el is Element => !!el);
  let typing = false;
  let up = false;
  let lastY = window.scrollY;
  // Visible only while the visitor scrolls back up (looking for a way to act), never
  // while reading downward, over the hero, the configurator controls, the contact
  // section or the footer, and never while typing.
  const refresh = () => fab.classList.toggle('is-on', up && blockers.size === 0 && !typing);
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 8) return;
      up = y < lastY;
      lastY = y;
      refresh();
    },
    { passive: true },
  );
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) blockers.add(e.target);
        else blockers.delete(e.target);
      }
      refresh();
    },
    { rootMargin: '0px 0px -80px 0px' },
  );
  watched.forEach((el) => io.observe(el));
  document.addEventListener('focusin', (e) => {
    typing = (e.target as Element).matches('input, textarea, select');
    refresh();
  });
  document.addEventListener('focusout', () => {
    typing = false;
    refresh();
  });
}

/* --------------------------------------------- in-page anchors */
type LenisLike = { scrollTo(t: Element | number, o?: object): void };
const lenisOf = () => (window as Window & { __lenis?: LenisLike }).__lenis;
/** Where a section should land: html's scroll-padding (header + 8px), the same rule
 *  native anchor scrolling and Lenis use. */
const headerOffset = () =>
  parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
  (document.querySelector<HTMLElement>('[data-hdr]')?.offsetHeight ?? 64) + 8;

// The anchor scroll in flight, so a layout change while it runs can re-aim it.
let pending: { target: HTMLElement; land: () => void; until: number } | null = null;

/**
 * Calls `done` once scrolling has stopped: on scrollend, or after a quiet period that a
 * fresh frame confirms (after a long task a timer can fire before the next frame has
 * moved the page, while a smooth scroll is still running).
 */
function afterScroll(done: () => void) {
  let timer = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('scrollend', finish);
    done();
  };
  const settle = () => {
    const y = window.scrollY;
    requestAnimationFrame(() => (window.scrollY === y ? finish() : onScroll()));
  };
  const onScroll = () => {
    clearTimeout(timer);
    timer = window.setTimeout(settle, 200);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scrollend', finish);
  timer = window.setTimeout(settle, 300); // no scrolling at all: already there
  setTimeout(settle, 3000);
}

/** If the target did not end up under the header (the layout moved), go there now. */
function correct(target: HTMLElement) {
  const want = headerOffset();
  const top = target.getBoundingClientRect().top;
  if (Math.abs(top - want) < 24) return;
  const atEnd = Math.ceil(window.scrollY) >= document.documentElement.scrollHeight - window.innerHeight - 1;
  if (top > want && atEnd) return; // last section: the page cannot scroll any further
  const lenis = lenisOf();
  if (lenis) lenis.scrollTo(window.scrollY + top - want, { immediate: true, force: true });
  else target.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
}

document.addEventListener('click', (e) => {
  // New tab / new window / other buttons: leave it to the browser, keep this page still.
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!a || a.hash.length < 2) return;
  let id = '';
  try {
    id = decodeURIComponent(a.hash.slice(1));
  } catch {
    return; // malformed hash: let the browser handle it
  }
  const target = document.getElementById(id);
  if (!target) return;
  const toTop = a.hash === '#top';
  // Move focus to the section heading so keyboard and screen-reader users land there too.
  const heading = target.querySelector<HTMLElement>('h1, h2') ?? target;
  const land = () => {
    pending = null;
    if (!toTop) correct(target);
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  };
  pending = { target, land, until: performance.now() + 4000 };
  const lenis = lenisOf();
  if (lenis) {
    e.preventDefault();
    // Lenis already keeps element targets below the header (it reads html's scroll-padding).
    lenis.scrollTo(toTop ? 0 : target, { duration: 1.3, onComplete: land });
    history.pushState(null, '', a.hash);
  } else {
    afterScroll(land); // the browser scrolls natively (smoothly unless reduced motion)
  }
});

// A section changed height while an anchor scroll was running: aim again.
window.addEventListener('lp:layout', () => {
  if (!pending || performance.now() > pending.until) return;
  const { target, land } = pending;
  const lenis = lenisOf();
  if (lenis) lenis.scrollTo(target, { duration: 0.6, onComplete: land });
  else target.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
});

/* --------------------------------------------- Lenis + GSAP (desktop, motion on) */
async function initSmoothScroll() {
  if (reducedMotion() || !matchMedia('(pointer: fine)').matches) return;
  await idle(3000);
  const [{ default: Lenis }, { gsap }, { ScrollTrigger }] = await Promise.all([
    import('lenis'),
    import('gsap'),
    import('gsap/ScrollTrigger'),
  ]);
  gsap.registerPlugin(ScrollTrigger);
  const lenis = new Lenis({
    duration: 1.05,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    syncTouch: false,
  });
  (window as Window & { __lenis?: unknown }).__lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  ScrollTrigger.refresh();
  window.addEventListener('lp:layout', () => ScrollTrigger.refresh());
}

if (document.readyState === 'complete') initSmoothScroll();
else window.addEventListener('load', () => initSmoothScroll(), { once: true });
