---
title: Design a Notification System
slug: notification-system
difficulty: medium
summary: Design a service that lets internal teams send push, email, and SMS notifications to users reliably and at scale.
functional:
  - Internal services can send a notification to a user through one API call
  - Supports push (iOS and Android), email, and SMS channels
  - Users can set preferences and opt out per channel and per notification type
  - Supports scheduled sends and bulk campaigns to millions of users
  - Tracks delivery status for each notification
rounds:
  - title: Scale it
    interviewer: "Now the volume. We send about a billion notifications a day, mostly push, and marketing likes to hit 50 million users in one go. What's your steady-state send rate, what does a campaign spike look like next to it, and what absorbs the difference?"
    constraints:
      - 200M registered users
      - "1B notifications per day: about 80% push, 15% email, 5% SMS"
      - Marketing campaigns can target 50M users at once
      - Horizontally scalable to absorb large campaign spikes
  - title: Make it reliable
    interviewer: "Our SMS provider starts timing out. What happens to push and email? And when you retry, how do you make sure nobody gets the same text three times? Also, support will want to look up what we sent someone last month."
    constraints:
      - Notifications are delivered at least once; duplicates should be rare
      - A slow or failing third-party provider must not block other channels
      - Third-party providers enforce their own rate limits
      - Delivery logs are kept for 90 days
  - title: Prioritize
    interviewer: "A 50M-user marketing blast is going out, and right in the middle someone requests a login code. They're staring at their phone. How does that code get there in seconds instead of waiting behind the campaign?"
    constraints:
      - Time-sensitive notifications like one-time passcodes are delivered within seconds
      - Campaigns must not delay time-sensitive traffic
clarifying:
  - id: volume
    question: "What volume should I plan for, and how is it split across channels?"
    answer: "About 1B notifications a day across 200M users: roughly 80% push, 15% email, 5% SMS."
    round: 2
  - id: campaigns
    question: "How big do bulk campaigns get?"
    answer: "A single campaign can target 50M users at once."
    round: 2
  - id: delivery-guarantee
    question: "Is at-least-once delivery okay, or do we need exactly-once?"
    answer: "At-least-once is fine, but duplicates should be rare. Nobody should get the same SMS twice."
    round: 3
  - id: urgency
    question: "Are some notifications more urgent than others?"
    answer: "Yes. One-time passcodes and similar messages must arrive within seconds, even during a big campaign."
    round: 4
hints:
  - Calculate the average and peak send rate. How does a 50M-user campaign compare to the steady state?
  - Should the API call send the notification directly, or hand it off? What sits between the two?
  - "Third-party providers like APNs, FCM, and SMS gateways have their own rate limits and outages. How do you isolate channels and retry safely?"
  - "Think about where you check user preferences and how you deduplicate so a retry does not text someone twice."
  - "If everything shares one queue, an OTP waits behind a campaign. How would you separate traffic by priority?"
---
Many teams in our company need to notify users, from password reset codes to order updates to marketing campaigns. Design a central service that accepts requests from internal services and delivers them over push, email, and SMS, respecting each user's preferences. Start with the API and the path a single notification takes from request to delivery. Writing message templates and building the providers themselves are out of scope; assume you call APNs, FCM, an email provider, and an SMS gateway.
