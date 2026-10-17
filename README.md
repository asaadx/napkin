# Napkin

Napkin is an open-source tool for practicing system design interviews the way they actually happen: out loud. Pick a prompt, sketch your architecture on a scratchpad, talk through your design, and (eventually) get graded by AI. v0 is just the prompt and the scratchpad.

## Quick start

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## How to add a prompt

Add a Markdown file at `prompts/<slug>.md` with YAML frontmatter:

```markdown
---
title: Design a URL Shortener
slug: url-shortener          # must match the file name
difficulty: easy             # easy | medium | hard
summary: One-sentence description shown on the home page list.
functional:
  - Users can shorten a long URL
non_functional:
  - Low latency redirects (p99 < 100ms)
scale:
  - 100M new URLs per day
hints:
  - Think about how you generate unique short codes
---
Optional longer Markdown body with context.
```

`title`, `slug`, `difficulty`, and `summary` are required; the lists are optional. Invalid files fail the build with a message naming the file. Prompts are sorted by difficulty, then title.

## Roadmap

- Design pass
- Voice transcript of your walkthrough
- Mocked grading
- Claude grading with your own API key

## License

See [LICENSE](LICENSE).
