import type {
  AuthView,
  ExampleSummary,
  HeaderView,
  NodeDetail,
  ParamView,
  RequestDetail,
  ScriptView,
  UrlView,
  VarRef,
} from '@/bindings';

/** Fixture DTOs for the detail pane — the wire shapes, not hand-rolled look-alikes. */

export const NO_AUTH: AuthView = {
  source: { kind: 'none' },
  authType: 'noauth',
  attributes: [],
};

export function param(
  key: string,
  value: string | null = null,
  overrides: Partial<ParamView> = {}
): ParamView {
  return { key, value, disabled: null, description: '', ...overrides };
}

export function header(key: string, value = '', overrides: Partial<HeaderView> = {}): HeaderView {
  return { key, value, disabled: null, description: '', ...overrides };
}

export function script(listen: string, source: string): ScriptView {
  return { listen, source, disabled: null };
}

export function example(index: number, name: string): ExampleSummary {
  return { index, name, status: 'OK', code: 200 };
}

export function varRef(name: string, defined: boolean): VarRef {
  return { name, defined };
}

export function url(raw: string, overrides: Partial<UrlView> = {}): UrlView {
  return {
    raw,
    protocol: null,
    host: null,
    port: null,
    path: null,
    query: [],
    pathVariables: [],
    ...overrides,
  };
}

export function requestDetail(overrides: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 'n1',
    name: 'Login',
    folderPath: ['Auth'],
    description: 'Authenticates a user and returns a JWT.',
    method: 'POST',
    url: url('https://api.example.com/auth/login'),
    headers: [],
    body: null,
    auth: NO_AUTH,
    events: [],
    behavior: [],
    examples: [],
    variableRefs: [],
    extra: [],
    ...overrides,
  };
}

export function requestNode(overrides: Partial<RequestDetail> = {}): NodeDetail {
  return { kind: 'request', ...requestDetail(overrides) };
}
