# Parking Lot

Ideas we're deliberately not building yet. Each entry says what it is, why it's parked, and what's still open.

## Rubber Ducky (guided practice assistant)

**What it is:** A live assistant that listens while you talk through a design and nudges you toward a good solution, like rubber-duck debugging but the duck talks back. You start rambling, and it points you in the right direction ("you haven't said how short codes stay unique, what happens with two writers?").

**What it is not:** The grader. The grader scores a finished attempt; the Ducky helps you *during* the attempt and never scores you. They're separate features with separate prompts.

**Why parked:** Get the core loop (prompt → sketch → talk → grade) working first. It may also be a candidate for a paid or hosted feature, since live guidance means many model calls per session, but we're not deciding monetization yet.

**Open questions:**
- How does it work in practice? (Founder to define.)
- When does it speak up: on a pause, on request, or on a timer?
- Text only, or spoken replies (text-to-speech)?
- Free with your own API key, or paid hosted?
