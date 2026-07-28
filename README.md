# Notes App

A full-stack notes application with a React frontend, an Express backend, and JSON-backed persistence. It supports note creation, editing, deletion, search, tags, sorting, markdown preview, optimistic saves, and offline awareness.

## Features

- List, create, edit, and delete notes
- Debounced search and tag filtering
- Sort by created date, updated date, or title
- Markdown preview for note content
- Keyboard shortcuts for creating and finding notes
- Offline status awareness and resilient API handling
- File-based persistence with validation and consistent error responses

## Tech stack

- Frontend: React + TypeScript + Vite
- Backend: Express + TypeScript
- Storage: JSON file in the data directory
- Testing: Node.js built-in test runner with fetch-based integration tests

## Architecture overview

- Client code lives in the client directory and communicates with the API over REST.
- Server code lives in the server directory and exposes the required notes and tags endpoints.
- Data is persisted in data/notes.json so the app works without a database setup.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start both the API and client:
   ```bash
   npm run dev
   ```
3. Open http://localhost:5173 for the UI and http://localhost:3000/health for the API health check.

## Build and test

```bash
npm test
npm run build
```

## Notes on trade-offs

- JSON file storage keeps the app simple and easy to run on a fresh clone.
- The frontend uses local state and direct API calls for a smaller, more maintainable implementation.
- The server uses focused validation and error shaping instead of a heavier framework to keep the project approachable.

## What I would improve next

- Add authentication and per-user notes
- Add deployment configuration for Vercel or Render
- Add end-to-end tests with Playwright
- Support soft delete and trash recovery
