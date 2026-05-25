# ai-drama-company (Agent-first structure)

This repository now follows an agent package layout inspired by your reference project:
- Root persona/state docs: `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, `AGENTS.md`, `HEARTBEAT.md`
- Skill package: `skills/giggle-openclaw-drama-agent`
- Output dirs: `outputs/logs`, `outputs/reports`, `outputs/videos`

## Run
1. `Copy-Item .env.example .env`
2. Fill `.env` (Giggle base URL and key)
3. `npm run dev`
4. Open `http://localhost:3000`
