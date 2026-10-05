/** Case- and diacritic-insensitive match across the given fields (Arabic-aware). */
export function matches(q: string | undefined, ...fields: Array<string | number | undefined>) {
  if (!q) return true;
  const needle = normalize(q);
  return fields.some((f) => f !== undefined && normalize(String(f)).includes(needle));
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "") // tashkeel + tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, "");
}
