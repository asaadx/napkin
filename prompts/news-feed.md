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
rounds:
  - title: Scale it
    interviewer: "Okay. Now put real numbers on it: 300 million daily users, 600 million new posts a day, and people open their feed about ten times a day. Which side of this system is actually busy, reads or writes?"
    constraints:
      - 300M daily active users
      - 600M new posts per day
      - Each user opens their feed about 10 times per day
      - Average user follows 200 accounts
  - title: Handle celebrities
    interviewer: "Now a pop star with 100 million followers posts. With your design, what happens next, and how long until the last follower sees it? Their fans expect it within seconds, like everyone else's posts."
    constraints:
      - Top accounts have up to 100M followers
      - Celebrity posts still reach followers' feeds within a few seconds
      - One celebrity post must not degrade feeds for everyone else
  - title: Make it fast and available
    interviewer: "Last round. Opening the feed has to be snappy, and I never want to show an error screen. I'd rather show a feed that's a few seconds stale. What do you cache, what do you give up, and what happens when part of the backend is down?"
    constraints:
      - "Home feed loads fast: p99 under 200ms"
      - Highly available; a slightly stale feed is better than an error
      - Eventual consistency is acceptable for feed contents
clarifying:
  - id: scale
    question: "How many users and posts, and how often do people read their feed?"
    answer: "300M daily users, 600M new posts a day, and each user opens their feed about 10 times a day."
    round: 2
  - id: follow-graph
    question: "What does the follow graph look like? Are there very popular accounts?"
    answer: "The average user follows 200 accounts, but top accounts have up to 100M followers."
    round: 3
  - id: latency
    question: "What's the latency target for loading the feed?"
    answer: "Under 200ms at p99."
    round: 4
  - id: consistency
    question: "Does the feed need to be perfectly up to date, or is some staleness okay?"
    answer: "Eventual consistency is fine. A slightly stale feed is much better than an error."
    round: 4
hints:
  - "Calculate feed read QPS versus post write QPS. Which side should you optimize for?"
  - Compare building the feed when it is read (pull) with precomputing it when a post is written (push).
  - Work out what happens with push when an account with 100M followers posts. How long does that fan-out take?
  - "Consider a hybrid: what if different kinds of accounts were handled differently, and what would you store in each precomputed feed?"
---
We want to build the home timeline for a social network like Twitter or Instagram. When a user opens the app, they should see recent posts from everyone they follow, newest first. Start with the basics: the data model for posts and follows, and how a feed gets built when someone opens it. ML ranking, ads, search, and media storage or transcoding are out of scope; reverse-chronological is fine.
