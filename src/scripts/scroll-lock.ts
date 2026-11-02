/**
 * Scroll lock shared by the mobile menu. Works with or without Lenis: when Lenis is
 * running we stop it, otherwise we clip the document.
 */
type LenisLike = { stop(): void; start(): void };

const lenis = () => (window as Window & { __lenis?: LenisLike }).__lenis;

export function lockScroll() {
  lenis()?.stop();
  document.documentElement.style.overflow = 'hidden';
}

export function unlockScroll() {
  document.documentElement.style.overflow = '';
  lenis()?.start();
}
