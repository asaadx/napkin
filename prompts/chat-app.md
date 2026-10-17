---
title: Design a Chat App
slug: chat-app
difficulty: medium
summary: Design a WhatsApp or Slack style messenger that supports real-time 1:1 and group conversations.
functional:
  - Users can send and receive 1:1 messages in real time
  - Users can create group chats of up to 500 members
  - Messages sent while a user is offline are delivered when they reconnect
  - Users see sent, delivered, and read receipts
  - Users can scroll back through conversation history on any device
non_functional:
  - Messages arrive in under 500ms for online recipients (p99)
  - Messages are never lost once the sender sees them as sent
  - Messages appear in a consistent order within a conversation
  - Highly available; a single data center failure should not stop messaging
scale:
  - 500M daily active users
  - Each user sends 40 messages per day on average
  - Average message is 200 bytes; history is kept forever
  - Up to 100M users connected at the same time at peak
hints:
  - How does the server push a message to a recipient? Compare polling with a long-lived connection.
  - With 100M open connections spread across many servers, how do you find which server a recipient is connected to?
  - "Work out the daily message write volume and storage per year. What does that suggest about how you partition message history?"
  - "Ordering is per conversation, not global. How could you assign sequence numbers, and how does a group message fan out to 500 members?"
---
We want to build a messaging app like WhatsApp or Slack. Users should be able to chat one-on-one or in groups, see messages arrive instantly, and pick up where they left off on another device. Focus on real-time delivery, offline handling, and message storage. Voice and video calls, end-to-end encryption details, and media uploads are out of scope.
