export function parseAllowlist(value: string): Set<string> {
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.some((id) => !/^[1-9]\d*$/.test(id)))
    throw new Error(
      "ALLOWED_TELEGRAM_USER_IDS must contain positive Telegram IDs.",
    );
  return new Set(ids);
}
