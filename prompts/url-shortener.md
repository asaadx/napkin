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
non_functional:
  - Low latency redirects (p99 < 100ms)
  - High availability for redirects (99.99%), since broken links break other people's sites
  - Short codes must be unique and should not be easily guessable in sequence
  - Created links must be durable and never silently lost
scale:
  - 100M new URLs per day
  - "Read-to-write ratio of about 100:1"
  - Links are retained for 5 years by default
  - Average long URL is about 500 bytes
hints:
  - Start by estimating how many short codes you need over 5 years, then work out how long a code has to be.
  - Redirects vastly outnumber writes. Where would you put a cache, and what would you key it on?
  - "Generating unique codes across many servers is the tricky part. Compare hashing the URL, a global counter, and pre-allocated ID ranges."
  - "Think about 301 vs 302 redirects: which one helps latency, and which one keeps your click counts accurate?"
---
We want to build a URL shortening service similar to bit.ly or TinyURL. A user pastes a long URL, gets a short link back, and anyone who clicks that link should land on the original page almost instantly. Focus on code generation, the redirect path, and storage. User accounts, detailed analytics dashboards, and spam or malware detection are out of scope.
