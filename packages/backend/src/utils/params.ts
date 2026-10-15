const PARAM_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidParamId(value: string): boolean {
  return PARAM_ID_RE.test(value);
}

export function getParamId(param: string | string[] | undefined): string {
  const raw = Array.isArray(param) ? (param[0] ?? '') : (param ?? '');
  const trimmed = raw.trim();
  if (!isValidParamId(trimmed)) return '';
  return trimmed;
}
