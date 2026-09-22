import type { ReactElement, ReactNode } from 'react';
import type { BodyView, FormFieldView, ParamView } from '@/bindings';
import { resolveGrammar } from '@/lib/highlight';
import { cn } from '@/lib/utils';
import { CodeBlock } from './code-block';
import { EmptySection } from './empty-section';
import { KeyValueTable } from './kv-table';
import { VariableText } from './variable-token';
import type { VariableIndex } from './variables';

/**
 * ux-design.md §S2b — the Body panel, all five modes (FR-026…FR-029).
 *
 * The switch below is exhaustive on the `BodyView` tag and ends in a `never` assignment, so a
 * sixth mode added to `bindings.ts` fails `tsc` here instead of shipping a blank panel — the
 * same contract `errorMessage` holds for `AppError` (T-019).
 *
 * **Variable chips are exempt inside code blocks** — the open question TC-COMP-022 asks to be
 * settled deliberately, settled here as *exempt*. Inside a highlighted block a `{{token}}` is
 * already carrying meaning from the grammar (it is a JSON string, a GraphQL variable, a
 * comment), and overlaying a second colour system on top of Shiki's makes both harder to read
 * while breaking the block's promise to show the file's bytes exactly as they are. Every
 * *tabular* value surface — urlencoded params, formdata values, the file path — does render
 * chips, so FR-035's "is this variable defined?" signal is never silently absent from a row.
 */

export interface BodyPanelProps {
  /** `null` is a request with no body at all; the Body tab then badges `—` and is "empty". */
  body: BodyView | null;
  variables: VariableIndex;
}

const SECTION_LABEL_CLASS =
  'mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase';

interface ModeHeaderProps {
  mode: string;
  /** The qualifier after the dot — the resolved grammar, the field count, the file path. */
  detail?: string;
}

/** The `raw · json` line of the mock. The mode is the panel's first fact about the body. */
function ModeHeader({ mode, detail }: ModeHeaderProps) {
  return (
    <p data-testid="body-mode" data-mode={mode} className={SECTION_LABEL_CLASS}>
      {mode}
      {detail === undefined ? null : (
        <>
          <span aria-hidden="true"> · </span>
          <span data-testid="body-mode-detail" className="normal-case">
            {detail}
          </span>
        </>
      )}
    </p>
  );
}

function BodySection({ testId, children }: { testId: string; children: ReactNode }): ReactElement {
  return (
    <div data-testid={testId} className="space-y-2">
      {children}
    </div>
  );
}

/** FR-027 — highlighted by the *declared* language, plain text when it declares nothing known. */
function RawBody({ language, text }: { language: string; text: string }): ReactElement {
  const grammar = resolveGrammar(language);
  return (
    <BodySection testId="body-raw">
      <ModeHeader mode="raw" detail={grammar} />
      {text === '' ? (
        <EmptySection what="Body" />
      ) : (
        <CodeBlock code={text} language={language} label="Request body" testId="body-raw-code" />
      )}
    </BodySection>
  );
}

function UrlencodedBody({
  params,
  variables,
}: {
  params: readonly ParamView[];
  variables: VariableIndex;
}): ReactElement {
  return (
    <BodySection testId="body-urlencoded">
      <ModeHeader mode="urlencoded" detail={`${params.length} fields`} />
      {params.length === 0 ? (
        <EmptySection what="Body fields" />
      ) : (
        <KeyValueTable
          rows={params.map((param) => ({
            key: param.key,
            value: param.value,
            disabled: param.disabled === true,
            description: param.description,
          }))}
          caption="Form fields"
          testId="body-urlencoded-table"
          variables={variables}
        />
      )}
    </BodySection>
  );
}

const HEAD_CLASS =
  'py-1 pr-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase';
const CELL_CLASS = 'py-1.5 pr-3 align-top';

/**
 * FR-029 — a formdata field says which kind it is, and a file field shows its path.
 *
 * `FormFieldView` carries `value` for text and `src` for file, never both, so the TYPE column is
 * not decoration: without it a row reading `./invoice.pdf` is indistinguishable from a text
 * field whose value happens to look like a path, and only one of the two makes Newman read a
 * file off disk.
 */
function FormdataBody({
  fields,
  variables,
}: {
  fields: readonly FormFieldView[];
  variables: VariableIndex;
}): ReactElement {
  return (
    <BodySection testId="body-formdata">
      <ModeHeader mode="formdata" detail={`${fields.length} fields`} />
      {fields.length === 0 ? (
        <EmptySection what="Body fields" />
      ) : (
        <table data-testid="body-formdata-table" className="w-full border-collapse text-sm">
          <caption className="sr-only">Form-data fields</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className={HEAD_CLASS}>
                Key
              </th>
              <th scope="col" className={HEAD_CLASS}>
                Type
              </th>
              <th scope="col" className={HEAD_CLASS}>
                Value
              </th>
              <th scope="col" className={HEAD_CLASS}>
                Content type
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <tr
                // Form-data keys legally repeat (multi-file uploads), so position is identity.
                key={`${field.key}:${index}`}
                data-testid="formdata-row"
                data-kind={field.kind}
                className="border-b last:border-0 hover:bg-muted/40"
              >
                <td className={cn(CELL_CLASS, 'font-mono text-xs break-all')}>
                  {field.key === '' ? (
                    <span className="text-muted-foreground italic">(no key)</span>
                  ) : (
                    <VariableText text={field.key} variables={variables} />
                  )}
                </td>
                <td className={CELL_CLASS}>
                  <span
                    data-testid="formdata-kind"
                    className="inline-block rounded-sm border px-1 text-[10px]"
                  >
                    {field.kind}
                  </span>
                </td>
                <td className={cn(CELL_CLASS, 'font-mono text-xs break-all')}>
                  <FormFieldValue field={field} variables={variables} />
                </td>
                <td className={cn(CELL_CLASS, 'font-mono text-xs break-all')}>
                  {field.contentType === null || field.contentType === '' ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    field.contentType
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </BodySection>
  );
}

function FormFieldValue({
  field,
  variables,
}: {
  field: FormFieldView;
  variables: VariableIndex;
}): ReactElement {
  const shown = field.kind === 'file' ? field.src : field.value;
  if (shown === null || shown === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span data-testid={field.kind === 'file' ? 'formdata-file-path' : 'formdata-text-value'}>
      <VariableText text={shown} variables={variables} />
    </span>
  );
}

/** A `file` body is a path Newman will read at run time — there is nothing else to show. */
function FileBody({ src, variables }: { src: string; variables: VariableIndex }): ReactElement {
  return (
    <BodySection testId="body-file">
      <ModeHeader mode="file" />
      {src === '' ? (
        <EmptySection what="File path" />
      ) : (
        <p data-testid="body-file-src" className="font-mono text-xs break-all">
          <VariableText text={src} variables={variables} />
        </p>
      )}
    </BodySection>
  );
}

/** FR-028 — query and variables are two different documents in two different languages. */
function GraphqlBody({ query, variables }: { query: string; variables: string }): ReactElement {
  return (
    <BodySection testId="body-graphql">
      <ModeHeader mode="graphql" />
      <section data-testid="body-graphql-query">
        <h4 className={SECTION_LABEL_CLASS}>Query</h4>
        {query === '' ? (
          <EmptySection what="GraphQL query" />
        ) : (
          <CodeBlock
            code={query}
            language="graphql"
            label="GraphQL query"
            testId="body-graphql-query-code"
          />
        )}
      </section>
      <section data-testid="body-graphql-variables" className="pt-2">
        <h4 className={SECTION_LABEL_CLASS}>Variables</h4>
        {variables === '' ? (
          <EmptySection what="GraphQL variables" />
        ) : (
          <CodeBlock
            code={variables}
            language="json"
            label="GraphQL variables"
            testId="body-graphql-variables-code"
          />
        )}
      </section>
    </BodySection>
  );
}

export function BodyPanel({ body, variables }: BodyPanelProps): ReactElement {
  if (body === null) return <EmptySection what="Body" />;

  switch (body.mode) {
    case 'raw':
      return <RawBody language={body.language} text={body.text} />;
    case 'urlencoded':
      return <UrlencodedBody params={body.params} variables={variables} />;
    case 'formdata':
      return <FormdataBody fields={body.fields} variables={variables} />;
    case 'file':
      return <FileBody src={body.src} variables={variables} />;
    case 'graphql':
      return <GraphqlBody query={body.query} variables={body.variables} />;
    default: {
      // FR-026 — a new BodyView mode fails tsc here rather than rendering an empty panel.
      const exhaustive: never = body;
      throw new Error(`Unhandled BodyView mode: ${JSON.stringify(exhaustive)}`);
    }
  }
}
