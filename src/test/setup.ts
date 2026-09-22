import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL ไม่ auto-cleanup เมื่อใช้ globals ของ Vitest — ถ้าไม่ล้าง DOM จะรั่วข้ามเทสต์
afterEach(cleanup);

// react-resizable-panels creates a ResizeObserver on mount; jsdom has no layout
// engine, so give it the next best thing — an observer that reports a fixed size.
class ResizeObserverMock implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', { configurable: true, value: 800 });
    Object.defineProperty(target, 'offsetHeight', { configurable: true, value: 600 });
    this.callback(
      [
        {
          target,
          borderBoxSize: [{ inlineSize: 800, blockSize: 600 }],
          contentRect: { width: 800, height: 600 } as DOMRect,
        } as unknown as ResizeObserverEntry,
      ],
      this
    );
  }

  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverMock;
}

// jsdom ships no matchMedia either; default to light so component tests that don't
// care about theming never crash. Theme tests stub a controllable query instead.
if (typeof window.matchMedia === 'undefined') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) satisfies MediaQueryList;
}
