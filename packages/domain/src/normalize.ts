const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * Normalizes Persian and Arabic-Indic digit characters to standard ASCII digits 0-9.
 */
export function toAsciiDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (digit) => {
      const index = PERSIAN_DIGITS.indexOf(digit);
      return index >= 0 ? String(index) : digit;
    })
    .replace(/[٠-٩]/g, (digit) => {
      const index = ARABIC_INDIC_DIGITS.indexOf(digit);
      return index >= 0 ? String(index) : digit;
    });
}

/**
 * Normalizes Arabic Yeh/Kaf letter variants to standard Persian Yeh/Kaf.
 * - Arabic Yeh (ي \u064A) and Alef Maksura (ى \u0649) -> Persian Yeh (ی \u06CC)
 * - Arabic Kaf (ك \u0643) and Swash Kaf (ڪ \u06AA) -> Persian Kaf (ک \u06A9)
 */
export function normalizeArabicPersianLetters(text: string): string {
  return text
    .replace(/[\u064A\u0649]/g, "\u06CC")
    .replace(/[\u0643\u06AA]/g, "\u06A9");
}

/**
 * Strips directional and formatting control characters (LRM, RLM, ALM, bidi embeds/isolates, BOM, ZWSP).
 * Preserves zero-width non-joiner (\u200C) when present in Persian word stems.
 */
export function stripBidiAndControlChars(text: string): string {
  return text.replace(
    /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF\u200B\u200D]/g,
    "",
  );
}

/**
 * Applies full protocol normalization:
 * 1. Unicode NFKC normalization
 * 2. Strips bidi and invisible control characters
 * 3. Normalizes Arabic Yeh/Kaf to Persian
 * 4. Normalizes Persian and Arabic-Indic digits to ASCII 0-9
 * 5. Replaces non-breaking/exotic spaces with ASCII spaces
 * 6. Normalizes internal whitespace runs and trims ends
 */
export function normalizeProtocolText(raw: string): string {
  const nfkc = raw.normalize("NFKC");
  const stripped = stripBidiAndControlChars(nfkc);
  const letterNormalized = normalizeArabicPersianLetters(stripped);
  const digitNormalized = toAsciiDigits(letterNormalized);

  return digitNormalized
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Normalizes protocol text and strips all whitespace for compact token parsing (e.g. "1 خ 104900" -> "1خ104900").
 */
export function normalizeCompactText(raw: string): string {
  return normalizeProtocolText(raw).replace(/\s+/g, "");
}
