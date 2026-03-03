export function truncateWithEllipsis(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 0) return "";
  if (maxLen === 1) return "…";

  let end = Math.max(0, maxLen - 1);
  if (end > 0) {
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) {
      const next = text.charCodeAt(end);
      if (next >= 0xdc00 && next <= 0xdfff) end -= 1;
    }
  }
  return `${text.slice(0, end)}…`;
}
