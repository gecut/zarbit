import {
  formatCompactPrice,
  formatDateTime,
  formatNumber as formatPersianNumber,
} from "@zarbit/format";

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

export function formatNumber(value: number): string {
  return formatPersianNumber(value);
}

export function formatPrice(value: number): string {
  return `${formatCompactPrice(value)} هزار تومان`;
}

export function formatTime(value: Date): string {
  return escapeMarkdown(formatDateTime(value));
}
