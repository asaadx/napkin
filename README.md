# Napkin

Napkin is an open-source tool for practicing system design interviews the way they actually happen: out loud. Pick a prompt, sketch your architecture on a scratchpad, talk through your design, and (eventually) get graded by AI. v0 is just the prompt and the scratchpad.

## Quick start

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## How to add a prompt

Add a Markdown file at `prompts/<slug>.md` with YAML frontmatter. Each prompt is an interview in rounds: the candidate starts with only the functional requirements, and the interviewer adds constraints round by round.

```markdown
---
title: Design a URL Shortener
slug: url-shortener          # must match the file name
difficulty: easy             # easy | medium | hard
summary: One-sentence description shown on the home page list.
functional:                  # Round 1 ("Core design"): the only requirements shown at the start
  - Users can shorten a long URL
rounds:                      # Rounds 2..N, in order (2 or 3 entries)
  - title: Scale it
    interviewer: "Now say we're doing 100M new URLs a day. What breaks first?"
    constraints:
      - 100M new URLs per day
clarifying:                  # "Ask the interviewer" questions (3-4)
  - id: scale                # unique within the prompt, kebab-case
    question: "What scale should I design for?"
    answer: "About 100M new URLs a day."
    round: 2                 # the round whose info this reveals early (2..N)
hints:
  - Think about how you generate unique short codes
---
The interviewer's Round 1 opening: 2-4 sentences, including what's out of scope.
```

`title`, `slug`, `difficulty`, and `summary` are required. Quote strings that contain colons or start with special characters. Invalid files fail the build with a message naming the file. Prompts are sorted by difficulty, then title.

## Roadmap

- Design pass
- Voice transcript of your walkthrough
- Mocked grading
- Claude grading with your own API key

## License

See [LICENSE](LICENSE).
