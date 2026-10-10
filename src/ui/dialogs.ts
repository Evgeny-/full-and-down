import { h, button } from './dom';
import { glyph } from './glyphs';
import { audio } from '../audio/audio';

export interface DialogButton {
  label: string;
  cls?: string;
  onClick: () => void | boolean;
}

export interface DialogOptions {
  title: string;
  head?: 'navy' | 'red' | 'blue' | 'yellow' | 'hazard';
  body?: (HTMLElement | string)[];
  buttons?: DialogButton[];
  row?: boolean;
  onClose?: () => void;
  cls?: string;
}

export interface DialogHandle {
  el: HTMLElement;
  close(): void;
}

let layer: HTMLElement;
const stack: DialogHandle[] = [];

export function initDialogs(root: HTMLElement): void {
  layer = root;
}

export function dialogOpen(): boolean {
  return stack.length > 0;
}

export function closeAllDialogs(): void {
  while (stack.length) stack[stack.length - 1].close();
}

export function openDialog(opts: DialogOptions): DialogHandle {
  const overlay = h('div', { class: 'overlay' + (opts.cls?.includes('report-dlg') ? ' low' : '') });
  const dlg = h('div', { class: 'dialog' + (opts.cls ? ' ' + opts.cls : ''), attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title } });
  dlg.append(h('div', { class: 'dialog-head ' + (opts.head ?? 'navy'), text: opts.title }));
  let closed = false;
  const handle: DialogHandle = {
    el: dlg,
    close() {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(handle);
      if (i >= 0) stack.splice(i, 1);
      overlay.classList.add('out');
      setTimeout(() => overlay.remove(), 180);
    },
  };
  if (opts.onClose) {
    const x = h('button', { class: 'btn close-x', html: glyph('close', 18), attrs: { 'aria-label': 'Close' } });
    x.addEventListener('click', () => {
      audio.play('button');
      handle.close();
      opts.onClose?.();
    });
    dlg.append(x);
  }
  for (const b of opts.body ?? []) dlg.append(typeof b === 'string' ? h('p', { html: b }) : b);
  if (opts.buttons?.length) {
    const actions = h('div', { class: 'actions' + (opts.row ? ' row' : '') });
    for (const b of opts.buttons) {
      actions.append(
        button(b.label, b.cls ?? '', () => {
          if (b.onClick() !== false) handle.close();
        }),
      );
    }
    dlg.append(actions);
  }
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay && opts.onClose) {
      handle.close();
      opts.onClose();
    }
  });
  overlay.append(dlg);
  layer.append(overlay);
  stack.push(handle);
  return handle;
}

let toastEl: HTMLElement | null = null;
let toastTimer = 0;

/** A one-line message; "WHO: text" puts the speaker in a stencil label. */
export function toast(root: HTMLElement, text: string, ms = 2400): void {
  if (!toastEl) toastEl = h('div', { class: 'toast' });
  if (toastEl.parentElement !== root) root.append(toastEl);
  const m = /^([A-Z][A-Z ]+):\s*(.*)$/.exec(text);
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  toastEl.innerHTML = m ? `<b>${m[1]}</b>${escapeHtml(cap(m[2]))}` : escapeHtml(text);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('show'), ms);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
