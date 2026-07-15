// Output-copy compliance guard (PRD §8 / business plan §8).
//
// Descriptive, not prescriptive: the brief may describe portfolio state and
// mechanics, but must never issue an action directive tied to a security.
// This is a cheap deterministic backstop behind the prompt rules; the actual
// legal boundary gets lawyer review before public launch (deployment plan §4).

const PRESCRIPTIVE_PATTERNS: RegExp[] = [
  /\byou (should|must|need to|ought to|may want to|might want to)\s+(buy|sell|trim|exit|add|hedge|reduce|book|accumulate|hold|switch|rotate)\b/i,
  /\bconsider (buying|selling|trimming|exiting|adding|hedging|reducing|booking|accumulating|holding)\b/i,
  // Verb is case-tolerant but the ticker must be uppercase, so we can't use /i here.
  /\b(?:[Bb]uy|[Ss]ell|[Aa]ccumulate|[Ee]xit)\s+(?:more\s+)?[A-Z]{2,}[A-Z0-9&._-]*\b/,
  /\bwe (recommend|suggest|advise)\b/i,
  /\b(strong\s+)?(buy|sell|hold)\s+(rating|call|recommendation)\b/i,
  /\btarget price\b/i,
  /\bstop.?loss at\b/i,
];

export interface ComplianceResult {
  ok: boolean;
  violations: string[];
}

export function checkCompliance(text: string): ComplianceResult {
  const violations: string[] = [];
  for (const pattern of PRESCRIPTIVE_PATTERNS) {
    const match = text.match(pattern);
    if (match) violations.push(match[0]);
  }
  return { ok: violations.length === 0, violations };
}
