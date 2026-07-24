# Taskhub-mobile

Expo React Native app for TaskHub — multi-business task monitoring with real-time chat.

## Features

- JWT auth with secure token storage (expo-secure-store)
- Dashboard, tasks, notifications, profile management
- Admin: businesses, users management
- **Real-time chat** — 1:1 and group messaging with online status, typing indicators, read receipts, image sharing
- i18n support (English / Telugu)
- Light/dark theme

## Setup

```bash
npm install
cp .env.example .env   # if needed
npx expo start
```

## Chat Feature

### Dependencies

- `socket.io-client` — WebSocket client for real-time messaging
- `expo-image-picker` — image picker for chat attachments

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `API_URL` | Backend API base URL | `https://vgrand-taskhub-backend.onrender.com/api` |

### Architecture

- `src/context/ChatContext.jsx` — manages Socket.IO connection, conversation list, messages, typing, presence, unread counts, and AppState (background/foreground) reconnect
- `src/screens/ChatListScreen.jsx` — conversation list with pull-to-refresh, new conversation modal
- `src/screens/ChatThreadScreen.jsx` — message thread with image picker, typing indicator, read receipts, infinite scroll for older messages
- `src/navigation/AppNavigator.jsx` — Chat tab in bottom navigator with unread badge; ChatThread as stack screen