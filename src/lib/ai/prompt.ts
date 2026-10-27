/**
 * Prompt for the vision/markup review. Deliberately persona-neutral: one call returns
 * the same findings plus a summary in each persona's voice, so switching persona can
 * change tone but never which issues exist or the score.
 */
export function buildPrompt(input: { kind: "image" | "html"; facts?: string }): string {
  const subject =
    input.kind === "image"
      ? "the attached UI screenshot"
      : "the HTML document below (you cannot see it rendered, so judge structure, copy and likely visual hierarchy from the markup)";

  return `You are a senior UI/UX and accessibility reviewer. Review ${subject}.

Focus on what needs human judgement: visual hierarchy, call-to-action clarity, copy, visual
contrast and readability, spacing/alignment, and typography. Be specific and concrete.
${
  input.facts
    ? `
These facts were MEASURED by deterministic checks on the page's markup. Treat them as ground
truth: do not contradict them and do not report the same problems again.
${input.facts}
`
    : ""
}
Rules:
- Return 3 to 6 issues ordered from most to least severe.
- severity: Critical = blocks users or fails WCAG A/AA; Warning = noticeable friction; Nitpick = polish.
- Contrast judgements from pixels are estimates — phrase them as such ("appears to be about 2:1").
- ${input.kind === "image" ? "box_2d is the problem area as [ymin, xmin, ymax, xmax] normalised to 0-1000 over the whole image." : "Omit box_2d."}
- fixCode is a realistic, self-contained HTML + Tailwind CSS snippet that fixes the issue.
- The three summaries must state the same facts in different voices.`;
}
