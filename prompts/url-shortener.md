---
title: Design a URL Shortener
slug: url-shortener
difficulty: easy
summary: Build a service like bit.ly that turns long URLs into short links and redirects visitors quickly.
functional:
  - Users can submit a long URL and get back a short link
  - Visiting a short link redirects to the original URL
  - Users can optionally choose a custom alias
  - Links can have an optional expiration date
  - Link owners can see a basic click count
rounds:
  - title: Scale it
    interviewer: "Okay, that works for a handful of users. Now say we're taking 100M new links a day, and every link gets clicked about a hundred times. Run the numbers for me. How long do your codes need to be, and what does storage look like?"
    constraints:
      - 100M new URLs per day
      - "Read-to-write ratio of about 100:1"
      - Links are retained for 5 years by default
      - Average long URL is about 500 bytes
  - title: Make it fast and reliable
    interviewer: "Other people's sites link to us, so a broken redirect breaks their pages too. Redirects need to be quick and basically never down, and we can't lose a link once we've handed it out. Also, someone just scraped every link by counting up through codes. Where does your design fall over?"
    constraints:
      - "Redirects are fast: p99 under 100ms"
      - "Redirects are highly available: 99.99%"
      - Short codes are unique and not guessable in sequence
      - Created links are durable and never silently lost
clarifying:
  - id: scale
    question: "What scale should I design for?"
    answer: "About 100M new links a day, and roughly 100 redirects for every link created."
    round: 2
  - id: retention
    question: "How long do links need to live, and how big are the URLs?"
    answer: "Keep links for 5 years by default. The average long URL is about 500 bytes."
    round: 2
  - id: sla
    question: "What latency and availability do redirects need?"
    answer: "Redirects should be under 100ms at p99, and available 99.99% of the time."
    round: 3
  - id: guessable
    question: "Is it a problem if short codes are sequential?"
    answer: "Yes. Codes must be unique, and nobody should be able to walk through them by counting."
    round: 3
hints:
  - Start with a single server and a single table. What does a create and a redirect look like end to end?
  - Estimate how many short codes you need over 5 years, then work out how long a code has to be.
  - "Redirects vastly outnumber writes. Where would you put a cache, and what would you key it on?"
  - "Generating unique, non-sequential codes across many servers is the tricky part. Compare hashing the URL, a global counter, and pre-allocated ID ranges."
  - "Think about 301 vs 302 redirects: which one helps latency, and which one keeps your click counts accurate?"
---
We want to build a URL shortener like bit.ly or TinyURL. A user pastes a long URL and gets a short link back, and anyone who clicks that link lands on the original page. Start simple: walk me through the API, the data model, and how a redirect works. User accounts, analytics dashboards, and spam or malware detection are out of scope.
