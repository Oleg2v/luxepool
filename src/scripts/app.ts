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

document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!a || a.hash.length < 2) return;
  const target = document.querySelector<HTMLElement>(a.hash);
  if (!target) return;
  const lenis = lenisOf();
  // Move focus to the section heading so keyboard and screen-reader users land there too.
  const heading = target.querySelector<HTMLElement>('h1, h2') ?? target;
  const land = () => {
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  };
  if (lenis) {
    e.preventDefault();
    const header = document.querySelector<HTMLElement>('[data-hdr]')?.offsetHeight ?? 64;
    lenis.scrollTo(a.hash === '#top' ? 0 : target, { offset: -header - 8, duration: 1.3, onComplete: land });
    history.pushState(null, '', a.hash);
  } else {
    setTimeout(land, reducedMotion() ? 0 : 600);
  }
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
}

if (document.readyState === 'complete') initSmoothScroll();
else window.addEventListener('load', () => initSmoothScroll(), { once: true });
