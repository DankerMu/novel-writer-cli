export type QuickstartMiniPlanningRange = { start: number; end: number };

export const QUICKSTART_MINI_PLANNING_RANGE = { start: 1, end: 3 } as const;

export function quickstartMiniPlanningChapters(
  range: QuickstartMiniPlanningRange = QUICKSTART_MINI_PLANNING_RANGE
): number[] {
  const chapters: number[] = [];
  for (let chapter = range.start; chapter <= range.end; chapter++) {
    chapters.push(chapter);
  }
  return chapters;
}

export function extractOutlineChapterNumbers(text: string): number[] {
  const chapterHeadingRe = /^###\s*第\s*(\d+)\s*章/u;
  const chapters: number[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = chapterHeadingRe.exec(line);
    if (!match) continue;
    const chapter = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isInteger(chapter) || chapter < 1) continue;
    chapters.push(chapter);
  }
  return chapters;
}

export function matchesQuickstartMiniPlanningSeedSequence(chapters: number[]): boolean {
  const expectedChapters = quickstartMiniPlanningChapters();
  return chapters.length === expectedChapters.length && chapters.every((chapter, index) => chapter === expectedChapters[index]);
}

export function startsWithQuickstartMiniPlanningSeedSequence(chapters: number[]): boolean {
  const expectedChapters = quickstartMiniPlanningChapters();
  return chapters.length >= expectedChapters.length && expectedChapters.every((chapter, index) => chapters[index] === chapter);
}
