import { methodTokens } from './tokens';
import type { MethodToken } from './tokens';

const methodClasses: Record<MethodToken, string> = {
  get: 'text-method-get',
  post: 'text-method-post',
  put: 'text-method-put',
  patch: 'text-method-patch',
  delete: 'text-method-delete',
  other: 'text-method-other',
};

export function methodToken(verb: string): MethodToken {
  const key = verb.toLowerCase();
  return (methodTokens as readonly string[]).includes(key) ? (key as MethodToken) : 'other';
}

export function methodClass(verb: string): string {
  return methodClasses[methodToken(verb)];
}
