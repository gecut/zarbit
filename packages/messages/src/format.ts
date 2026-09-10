export const TELEGRAM_PARSE_MODE = "MarkdownV2" as const;

export function escapeMarkdown(text: string): string {
  const reserved = new Set([
    "_",
    "*",
    "[",
    "]",
    "(",
    ")",
    "~",
    "`",
    ">",
    "#",
    "+",
    "-",
    "=",
    "|",
    "{",
    "}",
    ".",
    "!",
    "\\",
  ]);
  return [...text]
    .map((character) =>
      reserved.has(character) ? `\\${character}` : character,
    )
    .join("");
}

export function inlineCode(text: string): string {
  return "`" + text.replace(/[`\\]/g, "\\$&") + "`";
}

export function bold(text: string): string {
  return `*${escapeMarkdown(text)}*`;
}

const numberFormat = new Intl.NumberFormat("fa-IR");
const dateFormat = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatPrice(value: number): string {
  return `${formatNumber(value)} هزار تومان`;
}

export function formatTime(value: Date): string {
  return escapeMarkdown(dateFormat.format(value));
}
