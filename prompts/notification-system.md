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
non_functional:
  - Notifications are delivered at least once; duplicates should be rare
  - Time-sensitive notifications (like one-time passcodes) are delivered within seconds
  - Slow or failing third-party providers must not block other channels
  - Horizontally scalable to absorb large campaign spikes
scale:
  - 200M registered users
  - 1B notifications per day, about 80% push, 15% email, 5% SMS
  - Marketing campaigns can target 50M users at once
  - Delivery logs are kept for 90 days
hints:
  - Calculate the average and peak send rate. How does a 50M-user campaign compare to the steady state?
  - Should the API call send the notification directly, or hand it off? What sits between the two?
  - "Third-party providers like APNs, FCM, and SMS gateways have their own rate limits and outages. How do you isolate channels and retry safely?"
  - "Think about where you check user preferences and how you deduplicate so a retry does not text someone twice."
---
Many teams in our company need to notify users, from password reset codes to order updates to marketing campaigns. Design a central notification service that accepts requests from internal services and delivers them over push, email, and SMS, respecting each user's preferences. Focus on the pipeline, reliability, and handling traffic spikes. Writing message templates and building the actual third-party providers are out of scope; assume you call APNs, FCM, an email provider, and an SMS gateway.
