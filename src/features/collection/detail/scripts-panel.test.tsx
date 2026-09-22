import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { SCRIPT_NOTICE, ScriptsPanel } from './scripts-panel';
import { script } from './detail-fixtures';

/** T-017 — the Scripts panel (FR-033, NFR-009). */

declare global {
  var __pwned: true | undefined;
}

afterEach(() => {
  delete globalThis.__pwned;
});

describe('ScriptsPanel — display (FR-033)', () => {
  it('labels each event by type and shows its source', async () => {
    render(
      <ScriptsPanel
        events={[
          script('prerequest', 'pm.environment.set("ts", Date.now())'),
          script('test', 'pm.test("ok", () => {})'),
        ]}
      />
    );

    const sections = screen.getAllByTestId('script-event');
    expect(sections).toHaveLength(2);
    expect(within(sections[0] as HTMLElement).getByTestId('script-label')).toHaveTextContent(
      'Pre-request'
    );
    expect(within(sections[1] as HTMLElement).getByTestId('script-label')).toHaveTextContent(
      'Test'
    );

    await waitFor(() =>
      expect(screen.getByTestId('script-code-0')).toHaveAttribute('data-highlighted', 'true')
    );
    expect(screen.getByTestId('script-code-0-source')).toHaveTextContent('pm.environment.set');
    expect(screen.getByTestId('script-code-1-source')).toHaveTextContent('pm.test("ok"');
  });

  it('passes a non-standard listen value through verbatim', () => {
    render(<ScriptsPanel events={[script('beforeEach', 'noop()')]} />);
    expect(screen.getByTestId('script-label')).toHaveTextContent('beforeEach');
  });

  it('marks a disabled script rather than hiding it', () => {
    render(<ScriptsPanel events={[{ listen: 'test', source: 'noop()', disabled: true }]} />);

    expect(screen.getByTestId('script-event')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('script-disabled-marker')).toHaveTextContent('disabled');
  });

  it('highlights script source as JavaScript', async () => {
    render(<ScriptsPanel events={[script('test', 'const answer = 42;')]} />);
    const block = screen.getByTestId('script-code-0');
    expect(block).toHaveAttribute('data-grammar', 'js');
    await waitFor(() => expect(block).toHaveAttribute('data-highlighted', 'true'));
  });

  it('prints "(none)" when the request has no scripts', () => {
    render(<ScriptsPanel events={[]} />);
    expect(screen.getByTestId('empty-section')).toHaveTextContent('(none)');
  });
});

describe('ScriptsPanel — the trust notice (NFR-009)', () => {
  it('always shows the notice, with scripts and without', () => {
    const { rerender } = render(<ScriptsPanel events={[]} />);
    expect(screen.getByTestId('scripts-notice')).toHaveTextContent(SCRIPT_NOTICE);
    expect(SCRIPT_NOTICE).toMatch(/minim never runs them/i);

    rerender(<ScriptsPanel events={[script('test', 'noop()')]} />);
    expect(screen.getByTestId('scripts-notice')).toHaveTextContent(SCRIPT_NOTICE);
  });
});

/**
 * TC-U-078 — scripts are displayed, never executed.
 *
 * The assertion that matters is the *absence* of the side effect. Asserting only that the text
 * rendered would pass just as happily in a build that also evaluated it, which is precisely the
 * failure NFR-009 exists to make impossible.
 */
describe('ScriptsPanel — never evaluated (NFR-009 / TC-U-078)', () => {
  it('renders a side-effecting script as text and leaves the global untouched', async () => {
    expect(globalThis.__pwned).toBeUndefined();

    render(
      <ScriptsPanel
        events={[script('test', 'window.__pwned = true'), script('prerequest', 'globalThis.x = 1')]}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('script-code-0')).toHaveAttribute('data-highlighted', 'true')
    );

    expect(screen.getByTestId('script-code-0-source')).toHaveTextContent('window.__pwned = true');
    expect(globalThis.__pwned).toBeUndefined();
    expect(window.__pwned).toBeUndefined();
  });

  it('renders markup-shaped script source as text, never as elements (NFR-010)', async () => {
    const hostile = '</code></pre><img src=x onerror="window.__pwned = true">';
    render(<ScriptsPanel events={[script('test', hostile)]} />);

    const source = screen.getByTestId('script-code-0-source');
    await waitFor(() => expect(source.textContent).toBe(hostile));
    expect(source.querySelector('img')).toBeNull();
    expect(globalThis.__pwned).toBeUndefined();
  });
});
