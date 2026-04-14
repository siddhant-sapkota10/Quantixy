# MathBattle

Real-time multiplayer math game built with Next.js and a Socket.IO game server.

## Local Run

1. Install dependencies:
```bash
npm install
```

2. Configure frontend env:
```bash
cp apps/web/.env.local.example apps/web/.env.local
```

3. Configure backend env if needed:
```bash
cp apps/game-server/.env.example apps/game-server/.env
```

4. In Supabase, run the schema in:
```text
supabase/schema.sql
```

5. Start the backend:
```bash
npm run dev:server
```

6. Start the frontend:
```bash
npm run dev:web
```

7. Open:
```text
http://localhost:3000
```

## Environment Variables

### Frontend

`NEXT_PUBLIC_SOCKET_URL`

`NEXT_PUBLIC_SUPABASE_URL`

`NEXT_PUBLIC_SUPABASE_ANON_KEY`

Examples:
```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
NEXT_PUBLIC_SOCKET_URL=https://your-backend.onrender.com
```

### Backend

`PORT`

`CORS_ORIGIN`

`NEXT_PUBLIC_SUPABASE_URL`

`SUPABASE_SERVICE_ROLE_KEY`

Examples:
```env
PORT=3001
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

For multiple frontend origins:
```env
CORS_ORIGIN=https://your-app.vercel.app,http://localhost:3000
```

## Deployment

### Frontend on Vercel

1. In Supabase Auth, enable Google and add your frontend URL to the allowed redirect URLs. Enable email auth too if you want magic-link sign-in.
2. Import the repo into Vercel.
3. Set the project root to `apps/web` or configure the build to use the monorepo workspace.
4. Add:
```env
NEXT_PUBLIC_SOCKET_URL=https://your-backend-domain.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```
5. Deploy.

### Backend on Railway or Render

1. Deploy the `apps/game-server` service.
2. Start command:
```bash
node server.js
```
3. Add env vars:
```env
PORT=3001
CORS_ORIGIN=https://your-frontend-domain.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
4. Deploy and copy the public backend URL.
5. Set that URL as `NEXT_PUBLIC_SOCKET_URL` in the frontend deployment.
6. Make sure the Supabase schema has been applied before the backend boots.

## Notes

- Identity now comes from Supabase Auth.
- Players, topic ratings, and match history persist in Supabase across restarts.
- The frontend uses the public anon key, while the game server uses the service role key for trusted player and match writes.
- Gameplay, countdowns, rematches, sounds, streaks, and ELO continue to run through the same Socket.IO server in production.
