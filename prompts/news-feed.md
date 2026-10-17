---
title: Design a News Feed
slug: news-feed
difficulty: hard
summary: Design a Twitter or Instagram style home timeline that shows each user recent posts from the accounts they follow.
functional:
  - Users can publish posts with text and an optional image
  - Users can follow and unfollow other accounts
  - Users see a home feed of recent posts from accounts they follow, newest first
  - The feed supports infinite scroll through older posts
  - New posts from followed accounts appear in the feed within a few seconds
non_functional:
  - Home feed loads fast (p99 < 200ms)
  - Highly available; showing a slightly stale feed is better than showing an error
  - Eventual consistency is acceptable for feed contents
  - Must handle celebrity accounts with tens of millions of followers
scale:
  - 300M daily active users
  - 600M new posts per day
  - Each user opens their feed about 10 times per day
  - Average user follows 200 accounts; top accounts have 100M followers
hints:
  - "Calculate feed read QPS versus post write QPS. Which side should you optimize for?"
  - Compare building the feed when it is read (pull) with precomputing it when a post is written (push).
  - Work out what happens with push when an account with 100M followers posts. How long does that fan-out take?
  - "Consider a hybrid: what if different kinds of accounts were handled differently, and what would you store in each precomputed feed?"
---
We want to build the home timeline for a social network like Twitter or Instagram. When a user opens the app, they should immediately see recent posts from everyone they follow. Focus on how feeds are generated, stored, and served at scale, including very popular accounts. Ranking by machine learning, ads, search, and media storage and transcoding are out of scope; a reverse-chronological feed is fine.
