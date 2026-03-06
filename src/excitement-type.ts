export const EXCITEMENT_TYPES = ["reversal", "face_slap", "power_up", "reveal", "cliffhanger", "setup"] as const;

export type ExcitementType = (typeof EXCITEMENT_TYPES)[number];

const EXCITEMENT_TYPE_SET = new Set<string>(EXCITEMENT_TYPES);

export function normalizeExcitementType(raw: unknown): ExcitementType | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return undefined;

  const normalized = raw.trim();
  if (normalized.length === 0 || normalized === "null") return null;
  return EXCITEMENT_TYPE_SET.has(normalized) ? (normalized as ExcitementType) : undefined;
}
