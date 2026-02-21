# Repository Agent Notes

## Progress Log Requirement

- Keep `/Users/zkendall/projects/MowGrassMoMoney/progress.md` up to date.
- Read it before starting meaningful work.
- Append a short factual entry after each meaningful change (implementation, behavior/UX tweak, bug fix, or documentation sync).
- If verification is run alongside other changes, include it concisely in that same entry.
- Do not update `progress.md` for verification-only runs when no other files or behavior changed.
- Add notes concisely; use the shortest wording that preserves required detail.
- Keep verification notes brief:
  - Prefer a single line format: `- Verified by <command/script>.`
  - Do not include artifact file paths unless they are needed to explain a failure, regression, or debugging investigation.
  - Do not repeat no-change re-runs unless they add new signal.
- Preserve prior history; do not rewrite old entries unless explicitly requested.
