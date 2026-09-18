# Verification

- Production build and all eight tests pass.
- Physics, collision shapes, and Jev instructions are unchanged; the simulation now runs in a browser worker.
- Tests cover deterministic physics, collision detection, action expiry, stale/cross-ball responses, request validation, and safe API failures. Invalid requests do not call Jev.
- Agent-browser verified real Jev play through `/api/decision`, Start/End, score updates, and applied-move images. No page errors.
- Desktop 1440×1000 and mobile 390×844 / 320×740 fit the full board without horizontal overflow.
- Credentials are server-only. `.env.local`, Vercel project metadata, build output, and local test artifacts are excluded from Git.

The browser owns each game. A refresh starts a new session, and a suspended/background tab may be throttled by the browser. No pauses are introduced for model decisions.
