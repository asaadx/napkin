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
rounds:
  - title: Scale it
    interviewer: "Good. Now make it WhatsApp-sized: 500 million people a day, each sending about 40 messages, and we keep history forever. At peak, 100 million of them are connected at once. What does a year of messages weigh, and how do you hold all those connections?"
    constraints:
      - 500M daily active users
      - Each user sends 40 messages per day on average
      - Average message is 200 bytes; history is kept forever
      - Up to 100M users connected at the same time at peak
  - title: Make it reliable
    interviewer: "A user sees the check mark, then the message vanishes. Or two messages in a group show up in a different order for different people. Both are bugs I'd get paged for. And if we lose a whole data center, people should keep chatting. Walk me through how you prevent each."
    constraints:
      - Messages are never lost once the sender sees them as sent
      - Messages appear in a consistent order within a conversation
      - Highly available; a single data center failure does not stop messaging
  - title: Make it fast
    interviewer: "Last thing: it has to feel instant. Online recipients get messages in under half a second, including someone posting into a 500-person group. Where is the time going in your design right now?"
    constraints:
      - "Messages reach online recipients in under 500ms (p99)"
      - Group messages to 500 members meet the same latency target
clarifying:
  - id: scale
    question: "How many users, and how much messaging per user?"
    answer: "500M daily active users sending about 40 messages each per day, with up to 100M connected at peak."
    round: 2
  - id: retention
    question: "How long do we keep message history?"
    answer: "Forever. Messages average about 200 bytes."
    round: 2
  - id: consistency
    question: "Do messages need a strict global order, or just per conversation?"
    answer: "Per conversation is enough, but everyone in a conversation should see the same order. And once a message shows as sent, it must never be lost."
    round: 3
  - id: latency
    question: "What's the latency target for delivery?"
    answer: "Under 500ms at p99 for recipients who are online."
    round: 4
hints:
  - How does the server push a message to a recipient? Compare polling with a long-lived connection.
  - With 100M open connections spread across many servers, how do you find which server a recipient is connected to?
  - "Work out the daily message write volume and storage per year. What does that suggest about how you partition message history?"
  - "Ordering is per conversation, not global. How could you assign sequence numbers, and how does a group message fan out to 500 members?"
---
We want to build a messaging app like WhatsApp or Slack. Users chat one-on-one or in groups, see messages arrive as they're sent, and pick up where they left off on another device. Start with the core flow: how a message gets from sender to recipient, what happens when they're offline, and how history is stored. Voice and video calls, end-to-end encryption, and media uploads are out of scope.
