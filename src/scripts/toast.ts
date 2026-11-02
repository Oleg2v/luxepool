/**
 * One polite live region for short confirmations ("Concrete pool added to your quote").
 * Created at import time so screen readers register it before the first message.
 */
let el: HTMLElement | null = null;
let timer = 0;

function ensure() {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  return el;
}

if (typeof document !== 'undefined') ensure();

export function toast(message: string, action?: { href: string; label: string }) {
  const box = ensure();
  box.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  box.append(text);
  if (action) {
    const a = document.createElement('a');
    a.href = action.href;
    a.textContent = action.label;
    a.addEventListener('click', () => box.classList.remove('is-on'));
    box.append(a);
  }
  box.classList.add('is-on');
  clearTimeout(timer);
  timer = window.setTimeout(() => box.classList.remove('is-on'), 4600);
}
