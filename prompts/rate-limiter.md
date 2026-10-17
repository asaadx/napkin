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
non_functional:
  - Adds very little latency to each request (p99 < 5ms overhead)
  - Limits are enforced accurately across many API gateway instances, not per server
  - Highly available; if the limiter fails, the API keeps serving rather than going down
  - Scales horizontally as traffic grows
scale:
  - 1M requests per second at peak across the API fleet
  - 50M distinct API keys, about 5M active in any given hour
  - 200 API gateway instances in 3 regions
  - Typical rule is 1,000 requests per minute per key
hints:
  - Start with a single server. Which algorithms could you use, and how do they handle bursts at window edges?
  - Once there are 200 gateways, where does the counter for one API key live?
  - "Estimate the memory needed per active key for your chosen algorithm. Does it fit in a single in-memory store?"
  - "Consider the race between reading and incrementing a counter, and what you would trade to avoid a network round trip on every request."
---
We run a public API and need to stop any single client from overwhelming it, whether by accident or on purpose. Design a rate limiter that sits in front of our services and enforces per-client limits consistently across a large fleet of gateways. Focus on the limiting algorithm, where state lives, and how it behaves under failure. DDoS protection at the network layer and billing for overages are out of scope.
