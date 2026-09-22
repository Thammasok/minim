import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthAttrView, AuthView } from '@/bindings';
import { AuthPanel } from './auth-panel';
import { NO_AUTH } from './detail-fixtures';
import { EMPTY_VARIABLE_INDEX, buildVariableIndex } from './variables';

/** T-017 — the Auth panel (FR-030…FR-032). */

function attr(key: string, value: string | null, sensitive = false): AuthAttrView {
  return { key, value, sensitive };
}

function auth(overrides: Partial<AuthView> = {}): AuthView {
  return {
    source: { kind: 'own' },
    authType: 'bearer',
    attributes: [attr('token', 'ey.secret', true)],
    ...overrides,
  };
}

function renderAuth(value: AuthView, nodeId = 'n1', defined: readonly string[] = []) {
  return render(
    <AuthPanel
      auth={value}
      nodeId={nodeId}
      variables={
        defined.length === 0
          ? EMPTY_VARIABLE_INDEX
          : buildVariableIndex(defined.map((name) => ({ name, defined: true })))
      }
    />
  );
}

describe('AuthPanel — inheritance source (FR-030)', () => {
  // TC-U-075 — inherited auth names its source level.
  it('names the collection as the source when the auth is inherited from it', () => {
    renderAuth(auth({ source: { kind: 'collection' } }));

    const chip = screen.getByTestId('auth-source');
    expect(chip).toHaveAttribute('data-source', 'collection');
    expect(chip).toHaveTextContent(/inherited from collection/i);
    expect(screen.getByTestId('auth-type')).toHaveTextContent('bearer');
  });

  it('names the folder, by name, when the auth is inherited from a folder', () => {
    renderAuth(auth({ source: { kind: 'folder', name: 'Billing' } }));

    const chip = screen.getByTestId('auth-source');
    expect(chip).toHaveAttribute('data-source', 'folder');
    expect(chip).toHaveTextContent(/inherited from folder Billing/i);
  });

  it("says an own auth is the request's own, without an inherited marker", () => {
    renderAuth(auth({ source: { kind: 'own' } }));

    const chip = screen.getByTestId('auth-source');
    expect(chip).toHaveAttribute('data-source', 'own');
    expect(chip).toHaveTextContent(/defined on this request/i);
    expect(chip).not.toHaveTextContent(/inherited/i);
  });

  // FR-036 — nothing anywhere on the path.
  it('prints "(none)" when no level on the path declares any auth', () => {
    renderAuth(NO_AUTH);
    expect(screen.getByTestId('empty-section')).toHaveTextContent('(none)');
    expect(screen.queryByTestId('auth-panel')).not.toBeInTheDocument();
  });
});

describe('AuthPanel — unknown types (FR-031)', () => {
  it('passes an unrecognized type through verbatim and falls back to a raw attribute list', () => {
    renderAuth(
      auth({
        authType: 'quantumsig',
        attributes: [attr('lattice', 'kyber768'), attr('rounds', '4')],
      })
    );

    expect(screen.getByTestId('auth-panel')).toHaveAttribute('data-known-type', 'false');
    expect(screen.getByTestId('auth-type')).toHaveTextContent('quantumsig');
    expect(screen.getByTestId('auth-unknown-type')).toBeInTheDocument();

    const rows = screen.getAllByTestId('auth-attr');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-key', 'lattice');
    expect(within(rows[0] as HTMLElement).getByTestId('auth-attr-value')).toHaveTextContent(
      'kyber768'
    );
  });

  it('does not flag a schema-defined type as unrecognized', () => {
    renderAuth(auth({ authType: 'oauth2', attributes: [attr('grantType', 'implicit')] }));
    expect(screen.getByTestId('auth-panel')).toHaveAttribute('data-known-type', 'true');
    expect(screen.queryByTestId('auth-unknown-type')).not.toBeInTheDocument();
  });
});

describe('AuthPanel — masking (FR-032)', () => {
  // TC-U-076 — the raw value is absent from the DOM until reveal is activated.
  it('keeps a sensitive value out of the DOM entirely until it is revealed', async () => {
    const { container } = renderAuth(auth({ attributes: [attr('token', 'ey.secret', true)] }));

    expect(container.textContent).not.toContain('ey.secret');
    expect(screen.getByTestId('auth-attr')).toHaveAttribute('data-masked', 'true');
    expect(screen.getByTestId('auth-attr-value')).toHaveTextContent('•'.repeat(12));

    await userEvent.click(screen.getByTestId('auth-reveal'));

    expect(screen.getByTestId('auth-attr-value')).toHaveTextContent('ey.secret');
    expect(screen.getByTestId('auth-attr')).toHaveAttribute('data-masked', 'false');
  });

  it('masks per value — revealing the token leaves the password masked', async () => {
    const { container } = renderAuth(
      auth({
        authType: 'basic',
        attributes: [attr('username', 'ada'), attr('password', 'hunter2', true)],
      })
    );

    // A non-credential key is readable straight away.
    expect(container.textContent).toContain('ada');
    expect(container.textContent).not.toContain('hunter2');

    const rows = screen.getAllByTestId('auth-attr');
    expect(rows[0]).toHaveAttribute('data-masked', 'false');
    expect(rows[1]).toHaveAttribute('data-masked', 'true');
  });

  it('masks a credential-shaped key even when the backend did not flag it (ADR-016 belt)', () => {
    renderAuth(auth({ authType: 'apikey', attributes: [attr('key', 'AKIA-not-flagged', false)] }));

    expect(screen.getByTestId('auth-attr')).toHaveAttribute('data-masked', 'true');
    expect(screen.getByTestId('auth-attr-value')).not.toHaveTextContent('AKIA-not-flagged');
  });

  it('offers no reveal control for an empty or absent value', () => {
    renderAuth(auth({ attributes: [attr('token', null, true)] }));
    expect(screen.queryByTestId('auth-reveal')).not.toBeInTheDocument();
    expect(screen.getByTestId('auth-attr-value')).toHaveTextContent('—');
  });

  it('labels the reveal control for assistive tech and reflects its pressed state', async () => {
    renderAuth(auth({ attributes: [attr('token', 'ey.secret', true)] }));

    const button = screen.getByRole('button', { name: /reveal token/i });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(button);
    expect(screen.getByRole('button', { name: /hide token/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('renders variable chips in a revealed value', async () => {
    renderAuth(auth({ attributes: [attr('token', '{{apiToken}}', true)] }), 'n1', ['apiToken']);

    await userEvent.click(screen.getByTestId('auth-reveal'));
    expect(screen.getByTestId('var-chip')).toHaveAttribute('data-var', 'apiToken');
  });

  // TC-U-077 — revealing resets when a different request is selected.
  it('re-masks when the selected node changes and back again', async () => {
    const value = auth({ attributes: [attr('token', 'ey.secret', true)] });
    const { rerender, container } = renderAuth(value, 'A');

    await userEvent.click(screen.getByTestId('auth-reveal'));
    expect(container.textContent).toContain('ey.secret');

    // Select request B …
    rerender(<AuthPanel auth={value} nodeId="B" variables={EMPTY_VARIABLE_INDEX} />);
    expect(container.textContent).not.toContain('ey.secret');

    // … and back to A: the reveal did not survive the trip.
    rerender(<AuthPanel auth={value} nodeId="A" variables={EMPTY_VARIABLE_INDEX} />);
    expect(container.textContent).not.toContain('ey.secret');
    expect(screen.getByTestId('auth-attr')).toHaveAttribute('data-masked', 'true');
  });
});
