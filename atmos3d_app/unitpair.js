// Units in both systems in a case's story (expert panel review 2026-10-14: mph beside kt, inches beside mm, mixed in
// one paragraph, lost students). pairUnits(html) adds the other unit in brackets after a speed in mph ("73 mph (63 kt)")
// and a depth in inches ("25.10 in (638 mm)"), ranges too ("40–45 mph (35–39 kt)"). Inches are recognised only where
// the next word shows a depth (of, in, on, at, fell, near…) or punctuation follows, since "35 in Tacoma" is a
// temperature and "500 in Wenatchee" an air-quality index. A number already followed by a bracket, or inside one, is
// left alone. Pure, no imports.

const KT_PER_MPH = 0.868976, MM_PER_IN = 25.4;
const NEXT_IS_DEPTH = "(?=\\s(?:of|in|on|at|for|over|fell|fall|by|an|from|near|during|across|and)\\b|[,.;:!)]|<|$)";

const fmtIn = (mm) => (mm >= 10 ? Math.round(mm) : Math.round(mm * 10) / 10).toLocaleString("en-US");

export function pairUnits(html) {
  return html.split(/(<[^>]+>)/).map((p) => {
    if (p.startsWith("<")) return p;
    // speeds: "40–45 mph" or "73 mph", unless already paired
    p = p.replace(/(\(?)\b(\d+(?:\.\d+)?)(?:\s?[–-]\s?(\d+(?:\.\d+)?))?\s?mph\b(?!\s?\()/g, (m, open, a, b) => {
      if (open) return m;
      const k = (x) => Math.round(+x * KT_PER_MPH);
      return `${m} (${b ? `${k(a)}–${k(b)}` : k(a)} kt)`;
    });
    // depths: "25.10 in" or "2 to 4 in" (the last number), unless already paired or inside brackets
    p = p.replace(new RegExp(`(\\(?)\\b(\\d+(?:\\.\\d+)?)(?:\\s?[–-]\\s?(\\d+(?:\\.\\d+)?))?\\s?in${NEXT_IS_DEPTH}(?!\\s?\\()`, "g"), (m, open, a, b, off, str) => {
      if (open || str.slice(Math.max(0, off - 1), off) === "(") return m;
      return `${m} (${b ? `${fmtIn(+a * MM_PER_IN)}–${fmtIn(+b * MM_PER_IN)}` : fmtIn(+a * MM_PER_IN)} mm)`;
    });
    return p;
  }).join("");
}
