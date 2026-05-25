# SKILL: giggle-openclaw-drama-agent

## Purpose
Generate a complete short drama from one user idea using Giggle APIs, and display real-time process logs on embedded StoryClaw dashboard.

## Entrypoint
- `node skills/giggle-openclaw-drama-agent/scripts/server.js`

## Inputs
- User idea text
- Optional rendering params (aspect, duration, model)

## Workflow
1. Create project
2. Expand story
3. Generate characters
4. Generate storyboard
5. Generate storyboard images
6. Generate video clips
7. Export entire film

## Output
- Final export URLs (when available)
- Full execution logs by stage

## Assets
- `assets/dashboard.html` (boss provided dashboard)
- `assets/app.js` (OpenClaw runtime bridge)
