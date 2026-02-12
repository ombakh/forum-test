# Pinboard

Pinboard is a full-stack forum app with communities (boards), thread discussions, voting, profiles, and role-based moderation.

## Stack

- Frontend: React + Vite + React Router
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)
- Auth: JWT in `httpOnly` cookie

## Core Features

- Boards/communities with slugs (e.g. `/tech`)
- Create/delete boards
- Board ownership and board moderators
- Board settings (owner/admin): edit board + appoint/remove moderators
- Threads grouped under boards
- Thread voting (upvote/downvote, one vote per user)
- Thread responses/comments
- Response voting (upvote/downvote, one vote per user)
- Search (global and board-scoped)
- Sort threads by `Newest`, `Top`, `Most Active`, `Most Discussed`
- Public user profiles with post/comment history
- Admin panel:
  - View users
  - Ban/unban users
  - Delete threads

## Project Structure

- `client/`: React frontend
- `server/`: Express API + SQLite access
- `docs/`: notes/docs
- `scripts/`: utility scripts

## Local Development

1. Install dependencies:
   - `npm install`
2. Start both frontend and backend:
   - `make dev`

App URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`

## Environment

Create `server/.env` (or copy from `server/.env.example`):

```env
NODE_ENV=development
PORT=4000
CLIENT_URL=http://localhost:5173
JWT_SECRET=change_me_to_a_long_random_secret
JWT_EXPIRES_IN=1d
```

Optional frontend env (`client/.env`):

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

## Data Storage

- SQLite file: `server/data/forum.db`
- Existing DB migrations are handled at server startup in `server/src/db/index.js`

## Notable API Routes

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Boards:

- `GET /api/boards`
- `GET /api/boards/:slug`
- `GET /api/boards/:slug/threads`
- `POST /api/boards`
- `PATCH /api/boards/:boardId`
- `DELETE /api/boards/:boardId`
- `POST /api/boards/:boardId/moderators`
- `DELETE /api/boards/:boardId/moderators/:userId`

Threads:

- `GET /api/threads`
- `GET /api/threads/:threadId`
- `POST /api/threads`
- `POST /api/threads/:threadId/vote`
- `DELETE /api/threads/:threadId`

Responses:

- `GET /api/threads/:threadId/responses`
- `POST /api/threads/:threadId/responses`
- `POST /api/threads/:threadId/responses/:responseId/vote`

Users:

- `GET /api/users/:userId` (public profile)
- `GET /api/users/me`
- `GET /api/users/me/threads`
- `GET /api/users` (admin)
- `POST /api/users/:userId/ban` (admin)

## Notes

- Om Bakhshi account is automatically seeded as admin (if found by name/email).
- Default boards are seeded (`General`, `Tech`, `Q&A`, `Showcase`).
