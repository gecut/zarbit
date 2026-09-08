export function parseRequestSearch(search: Record<string, unknown>): { requestId?: string } {
  const value = search.requestId;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value)
    ? { requestId: value }
    : {};
}
