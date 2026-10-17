---
title: Design a Rate Limiter
slug: rate-limiter
difficulty: medium
summary: Design a distributed rate limiter that protects a public API by capping how many requests each client can make.
functional:
  - Limit requests per client (API key or user ID) over a configurable time window
  - Support different limits for different endpoints and pricing tiers
  - Rejected requests get an HTTP 429 with headers showing the limit, remaining quota, and reset time
  - Operators can update limit rules without redeploying services
rounds:
  - title: Scale it
    interviewer: "Fine on one box. Now we're at a million requests a second at peak, with 50 million API keys out there. How much state are you holding, and does it still fit where you put it?"
    constraints:
      - 1M requests per second at peak across the API fleet
      - 50M distinct API keys, about 5M active in any given hour
      - Typical rule is 1,000 requests per minute per key
  - title: Go distributed
    interviewer: "Here's the catch: that traffic hits 200 gateways across three regions. A client who spreads requests across all of them shouldn't get 200 times their limit. Where does the counter for one key actually live?"
    constraints:
      - 200 API gateway instances in 3 regions
      - Limits are enforced accurately across all gateways, not per server
      - Scales horizontally as traffic grows
  - title: Stay fast under failure
    interviewer: "You're now in the path of every request we serve. What does that cost us in latency? And when your counter store goes down at 3am, does the whole API go down with it?"
    constraints:
      - "Adds very little latency: p99 overhead under 5ms"
      - If the limiter fails, the API keeps serving rather than going down
      - A single counter-store node failure must not take out limiting for every client
clarifying:
  - id: traffic
    question: "How much traffic and how many clients are we talking about?"
    answer: "About 1M requests per second at peak, 50M API keys total, around 5M active in any hour. A typical rule is 1,000 requests per minute."
    round: 2
  - id: fleet
    question: "Is this one gateway or many? Do limits have to be global?"
    answer: "There are 200 gateways across 3 regions, and limits must hold across all of them, not per server."
    round: 3
  - id: latency
    question: "How much latency can the limiter add?"
    answer: "Very little. Keep the overhead under 5ms at p99."
    round: 4
  - id: failure-mode
    question: "If the limiter is unavailable, should we fail open or closed?"
    answer: "Fail open. Keeping the API serving matters more than perfect enforcement during an outage."
    round: 4
hints:
  - Start with a single server. Which algorithms could you use, and how do they handle bursts at window edges?
  - "Estimate the memory needed per active key for your chosen algorithm. Does it fit in a single in-memory store?"
  - Once there are 200 gateways, where does the counter for one API key live?
  - "Consider the race between reading and incrementing a counter, and what you would trade to avoid a network round trip on every request."
---
We run a public API and need to stop any single client from overwhelming it, whether by accident or on purpose. Design a rate limiter that enforces per-client limits in front of our services. Start with the limiting algorithm and how rules are configured, and assume one server for now. Network-layer DDoS protection and billing for overages are out of scope.
