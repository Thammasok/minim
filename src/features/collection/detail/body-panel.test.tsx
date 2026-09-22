import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { BodyView } from '@/bindings';
import { BodyPanel } from './body-panel';
import { EMPTY_VARIABLE_INDEX, buildVariableIndex } from './variables';
import { param } from './detail-fixtures';

/**
 * T-017 — the Body panel (FR-026…FR-029).
 *
 * Shiki is deliberately *not* mocked in this suite. The highlighter is the part most likely to
 * fail only outside a unit test — a grammar that will not load under the fine-grained bundle
 * would still pass a mocked suite — so the raw and GraphQL cases wait for real tokenization and
 * then assert that the code element's text is still exactly the file's bytes.
 */

function renderBody(body: BodyView | null, defined: readonly string[] = []) {
  return render(
    <BodyPanel
      body={body}
      variables={
        defined.length === 0
          ? EMPTY_VARIABLE_INDEX
          : buildVariableIndex(defined.map((name) => ({ name, defined: true })))
      }
    />
  );
}

/** Waits for the async highlight pass so the assertion runs against the settled DOM. */
async function highlighted(testId: string): Promise<HTMLElement> {
  const block = screen.getByTestId(testId);
  await waitFor(() => expect(block).toHaveAttribute('data-highlighted', 'true'));
  return block;
}

describe('BodyPanel — the five modes (FR-026 / TC-U-073)', () => {
  it('renders the raw view for a raw body', async () => {
    renderBody({ mode: 'raw', language: 'json', text: '{\n  "a": 1\n}' });

    expect(screen.getByTestId('body-raw')).toBeInTheDocument();
    expect(screen.getByTestId('body-mode')).toHaveAttribute('data-mode', 'raw');
    const block = await highlighted('body-raw-code');
    expect(within(block).getByTestId('body-raw-code-source')).toHaveTextContent('"a": 1');
  });

  it('renders the urlencoded view for a urlencoded body', () => {
    renderBody({ mode: 'urlencoded', params: [param('grant_type', 'password')] });

    expect(screen.getByTestId('body-urlencoded')).toBeInTheDocument();
    expect(screen.getByTestId('body-mode')).toHaveAttribute('data-mode', 'urlencoded');
    const table = screen.getByTestId('body-urlencoded-table');
    expect(within(table).getByText('grant_type')).toBeInTheDocument();
    expect(within(table).getByText('password')).toBeInTheDocument();
  });

  it('renders the formdata view for a formdata body', () => {
    renderBody({
      mode: 'formdata',
      fields: [{ key: 'note', kind: 'text', value: 'urgent', src: null, contentType: null }],
    });

    expect(screen.getByTestId('body-formdata')).toBeInTheDocument();
    expect(screen.getByTestId('body-mode')).toHaveAttribute('data-mode', 'formdata');
  });

  it('renders the file view for a file body', () => {
    renderBody({ mode: 'file', src: './payload.bin' });

    expect(screen.getByTestId('body-file')).toBeInTheDocument();
    expect(screen.getByTestId('body-mode')).toHaveAttribute('data-mode', 'file');
    expect(screen.getByTestId('body-file-src')).toHaveTextContent('./payload.bin');
  });

  it('renders the graphql view for a graphql body', async () => {
    renderBody({ mode: 'graphql', query: 'query Me { me { id } }', variables: '{}' });

    expect(screen.getByTestId('body-graphql')).toBeInTheDocument();
    expect(screen.getByTestId('body-mode')).toHaveAttribute('data-mode', 'graphql');
    await highlighted('body-graphql-query-code');
    await highlighted('body-graphql-variables-code');
  });

  // FR-036 — a request with no body at all.
  it('prints "(none)" when the request has no body', () => {
    renderBody(null);
    expect(screen.getByTestId('empty-section')).toHaveTextContent('(none)');
    expect(screen.queryByTestId('body-mode')).not.toBeInTheDocument();
  });
});

describe('BodyPanel — raw highlighting (FR-027 / TC-U-074)', () => {
  it('highlights by the declared language', async () => {
    renderBody({ mode: 'raw', language: 'json', text: '{"a": 1}' });

    const block = await highlighted('body-raw-code');
    expect(block).toHaveAttribute('data-grammar', 'json');
    expect(screen.getByTestId('body-mode-detail')).toHaveTextContent('json');
  });

  it('falls back to plain text — and stays unhighlighted — when nothing usable is declared', async () => {
    renderBody({ mode: 'raw', language: '', text: 'hello' });

    const block = screen.getByTestId('body-raw-code');
    expect(block).toHaveAttribute('data-grammar', 'text');
    expect(screen.getByTestId('body-mode-detail')).toHaveTextContent('text');
    // Nothing is loaded for plain text, so this attribute can never flip.
    await expect(
      waitFor(() => expect(block).toHaveAttribute('data-highlighted', 'true'), { timeout: 150 })
    ).rejects.toThrow();
    expect(screen.getByTestId('body-raw-code-source')).toHaveTextContent('hello');
  });

  it('falls back to plain text for a language outside the six', () => {
    renderBody({ mode: 'raw', language: 'rust', text: 'fn main() {}' });
    expect(screen.getByTestId('body-raw-code')).toHaveAttribute('data-grammar', 'text');
  });
});

describe('BodyPanel — graphql (FR-028)', () => {
  it('shows the query and the variables as two separate blocks', async () => {
    renderBody({
      mode: 'graphql',
      query: 'query Me { me { id } }',
      variables: '{ "id": "{{userId}}" }',
    });

    const query = screen.getByTestId('body-graphql-query');
    const vars = screen.getByTestId('body-graphql-variables');
    expect(within(query).getByRole('heading', { name: 'Query' })).toBeInTheDocument();
    expect(within(vars).getByRole('heading', { name: 'Variables' })).toBeInTheDocument();

    await highlighted('body-graphql-query-code');
    await highlighted('body-graphql-variables-code');

    expect(within(query).getByTestId('body-graphql-query-code-source')).toHaveTextContent(
      'query Me { me { id } }'
    );
    expect(within(vars).getByTestId('body-graphql-variables-code-source')).toHaveTextContent(
      '{{userId}}'
    );
  });

  it('prints "(none)" for a graphql body with no variables', async () => {
    renderBody({ mode: 'graphql', query: 'query Me { id }', variables: '' });

    const vars = screen.getByTestId('body-graphql-variables');
    expect(within(vars).getByTestId('empty-section')).toHaveTextContent('(none)');
    await highlighted('body-graphql-query-code');
  });
});

describe('BodyPanel — formdata (FR-029)', () => {
  it('distinguishes text fields from file fields and shows the file path', () => {
    renderBody({
      mode: 'formdata',
      fields: [
        { key: 'invoice', kind: 'file', value: null, src: './inv.pdf', contentType: null },
        { key: 'note', kind: 'text', value: 'urgent', src: null, contentType: 'text/plain' },
      ],
    });

    const rows = screen.getAllByTestId('formdata-row');
    expect(rows).toHaveLength(2);

    expect(rows[0]).toHaveAttribute('data-kind', 'file');
    expect(within(rows[0] as HTMLElement).getByTestId('formdata-kind')).toHaveTextContent('file');
    expect(within(rows[0] as HTMLElement).getByTestId('formdata-file-path')).toHaveTextContent(
      './inv.pdf'
    );

    expect(rows[1]).toHaveAttribute('data-kind', 'text');
    expect(within(rows[1] as HTMLElement).getByTestId('formdata-text-value')).toHaveTextContent(
      'urgent'
    );
    expect(within(rows[1] as HTMLElement).getByText('text/plain')).toBeInTheDocument();
  });

  it('prints "(none)" for a formdata body with no fields', () => {
    renderBody({ mode: 'formdata', fields: [] });
    expect(screen.getByTestId('empty-section')).toHaveTextContent('(none)');
  });
});

describe('BodyPanel — urlencoded (FR-024/FR-025 reuse)', () => {
  it('marks a disabled field rather than hiding it', () => {
    renderBody({
      mode: 'urlencoded',
      params: [param('debug', '1', { disabled: true }), param('scope', 'full')],
    });

    const rows = screen.getAllByTestId('kv-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-disabled', 'true');
    expect(within(rows[0] as HTMLElement).getByTestId('disabled-marker')).toHaveTextContent(
      'disabled'
    );
  });
});

/**
 * TC-COMP-022, the explicit decision.
 *
 * `{{var}}` chips render in every *tabular* value surface and are exempt inside a Shiki code
 * block. Both halves are asserted, so the exemption is a decision this suite defends rather than
 * an accident nobody noticed.
 */
describe('BodyPanel — variable chips (FR-035 / TC-COMP-022)', () => {
  it('renders chips in tabular value surfaces', () => {
    renderBody(
      {
        mode: 'formdata',
        fields: [{ key: 'to', kind: 'text', value: '{{userEmail}}', src: null, contentType: null }],
      },
      ['userEmail']
    );

    const chip = screen.getByTestId('var-chip');
    expect(chip).toHaveTextContent('{{userEmail}}');
    expect(chip).toHaveAttribute('data-defined', 'true');
  });

  it('renders a chip for the file-mode path', () => {
    renderBody({ mode: 'file', src: '{{fixtureDir}}/payload.bin' });
    expect(screen.getByTestId('var-chip')).toHaveAttribute('data-var', 'fixtureDir');
  });

  it('deliberately exempts code blocks: the variable stays literal source text', async () => {
    renderBody({ mode: 'raw', language: 'json', text: '{"email": "{{userEmail}}"}' }, [
      'userEmail',
    ]);

    const block = await highlighted('body-raw-code');
    expect(within(block).queryByTestId('var-chip')).not.toBeInTheDocument();
    // The block still shows the token — it is source text, not a chip.
    expect(within(block).getByTestId('body-raw-code-source')).toHaveTextContent('{{userEmail}}');
  });
});
