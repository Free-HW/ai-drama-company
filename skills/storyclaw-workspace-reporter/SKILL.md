---
name: storyclaw-workspace-reporter
version: "1.4.10"
description: Register lasting agent outputs (files, images) into the user's StoryClaw workspace, optionally produce a public share link, and read/write the user's cross-agent memory store. Mode-aware (Creation / Code) per the storyclaw-website creation-mode plan.
optional_env:
  - STORYCLAW_WORKSPACE_BASE_URL
---

# Workspace Reporter

Use this skill to **register lasting agent outputs** so the user can find
them later from the StoryClaw drawer or the dashboard "Workspace" page.
The chat history gets pruned; anything worth keeping goes here.

## Mode awareness

User messages may carry hidden markers as the first lines of the
message body:

- `[SC_MODE:CREATION]` — Creation mode (media creation flow)
- `[SC_MODE:CODE]`     — Code mode (vibe-code / web app generation flow)
- (no `SC_MODE` marker) — Off mode (default)
- `[SC_USER_LANG:<code>]` — BCP-47 locale of the user's UI
  (e.g. `zh-CN`, `zh-TW`, `ja`, `en`). Present whenever a mode marker
  is. **Match this locale across every user-facing string you
  produce** — chat replies, status messages, `creation_update`
  `--message`, `creation_ask` `--question` text and every
  `--option <value>:<label>` label. The `value` slug can stay ASCII
  but the `label` is shown to the user and must be in their language.
  Drifting to English mid-Chinese-conversation is the most-reported
  bug in creation mode; this marker exists specifically so you don't
  have to infer language from message history.

Check the marker on the **latest** user message before each turn. The
marker indicates which workflow the user has opened and which tool set
they expect you to reach for:

- **off**       — only use the workspace / memory tools documented below.
                  Register lasting outputs with `workspace_report_artifact`.
- **creation**  — the user has opened the Creation surface for media
                  outputs (image / video / audio / file). Use the
                  `creation_*` tools documented in **Creation mode tools**
                  below — **do NOT use `workspace_report_artifact`**.
                  The deliverable must land in `creation_artifacts`
                  (via `creation_attach.py`), not in the generic
                  `workspace_items` table, or the Creation timeline will
                  stay empty and the user won't see your output.
- **code**      — the user has opened the Code surface for generating a
                  Vite + React SPA published to Cloudflare Pages + Turso.
                  Additional `vibecode_*` tools may be available; follow
                  the protocol described in the creation-mode plan. Do
                  not promise to publish if the `vibecode_*` tools are
                  not present in your environment.

Older markers in the conversation are historical context only. Always
trust the marker on the latest user message you're responding to. If
no marker is present, behave as if the user is in **off** mode.

## When to use

Call `workspace_report_artifact` whenever you produce a file the user
might want to keep — images, PDFs, code, transcripts, generated assets.

**Outputs delivered as a URL must be downloaded first.** When a tool or
upstream service hands you the result as a link (Sora video, DALL·E /
Midjourney image, TTS audio, signed S3 URL, anything similar), download
the bytes to local disk with `curl` / `wget` / your runtime's HTTP
client, then call `workspace_report_artifact` against the local path.
The workspace stores **files**, not links. A URL that expires in an hour
is not a lasting output.

External URLs the user can simply visit (a docs page, a repo, a deployed
site) do **not** belong in the workspace — keep those in chat. Workspace
is for outputs **you produced** that need to survive scrollback.

You do **not** need to ask for permission to register. Registering is
cheap, and the user can delete anything. What matters is you name and
describe each item clearly so the user can find it again.

## Tools

All tools live in `scripts/`. Call them via your shell. They read
auth from a `.auth` file next to SKILL.md, provisioned per-install
by the StoryClaw installer.

### When the auth key is missing

If a tool exits with `auth file not found` / `auth file is empty`,
the skill has no key. This commonly happens when the skill arrived
inside a packaged agent — the originating agent's `.auth` is
intentionally stripped on package, so the receiver inherits the
files but not the key.

**Don't try to fabricate or recover a key.** Tell the user:

> The workspace skill needs a key. Open the workspace settings
> (the ⚙ menu in the workspace panel) and click **Reset workspace
> skill**. That re-runs the installer and provisions a fresh key
> for this device. Then re-trigger whatever you were doing.

Stop after surfacing that message; do not retry the tool.

### `workspace_report_artifact.py`

Upload a local file as a private artifact.

```
python scripts/workspace_report_artifact.py \
  --file /path/to/output.png \
  --title "Logo exploration v3" \
  --description "teal + coral palette, vector in Figma-export PNG" \
  --output-process "agent ran stable-diffusion-xl, upscaled with 4xESRGAN"
```

Optional: `--tags tag1 --tags tag2`, `--mime image/png` (auto-detected otherwise).

If the output came from a remote URL (Sora video, generator image, etc.),
download it first:

```
curl -L -o /tmp/sora_output.mp4 "https://sora.example/v/abc123"
python scripts/workspace_report_artifact.py \
  --file /tmp/sora_output.mp4 \
  --title "Hero clip — kids running through autumn forest" \
  --description "sora-2, 8s, 1080p" \
  --output-process "sora prompt: 'children running through golden autumn forest, slow-mo, cinematic'"
```

### `workspace_list.py`

List what you've already registered, to avoid duplicates.

```
python scripts/workspace_list.py --limit 20
```

### `workspace_update.py`

Fix a title / description / tags on an item you created.

```
python scripts/workspace_update.py \
  --id <itemId> \
  --title "Corrected title"
```

### `workspace_create_share.py`

Produce a **public share link** (anyone with the link can view) for an
item you registered. Use this when the user asks for a shareable URL,
or when the artifact is meant to be sent to someone outside the chat.

```
python scripts/workspace_create_share.py \
  --item-id <itemId> \
  --expiry 7d
```

Flags: `--expiry 1d|7d|30d|never` (default `7d`), `--locale en|ja|zh-CN|zh-TW`
(default `en`, only affects the link host).

The tool prints a single line on success:

```
ok share_url=https://<owner>.storyclaw.app/share/abc123 token=abc123 expires=2026-05-19T...
```

Quote the URL back to the user verbatim — do not paraphrase or shorten
it. Agents cannot create email-invite ("specified") shares; that is a
user-only flow in the StoryClaw dashboard.

## Creation mode tools

These tools are active when the latest user message carries
`[SC_MODE:CREATION]` (or `[SC_MODE:CODE]` once Phase 3 ships the
`vibecode_*` tools). They drive the Creation timeline and the Code
mode shell — see plan v2.7 §技能工具集 for the full design.

**Hard rule (plan §askQuestion 行为).** When a user message references
a creation, or you're continuing a prior creation, call `creation_get`
**first** to rebuild context — never reconstruct it from chat
history alone. Conversation history gets pruned; the creations table
is the source of truth for status / metadata / artifacts / questions.

### End-to-end flow (mandatory; do this every time)

For every new media output the user asks for in creation mode, run
the contract below. **Do not** fall back to `workspace_report_artifact`
— it writes to a different table and the Creation timeline will not
see the result.

**Step 0 — clarify first (skip only if unambiguous).** If the user's
request leaves a real choice open (aspect ratio, length, voice / lang,
file format, target audience, mood, …) clarify **before** calling
`creation_create`. Don't guess and don't produce a creation the user
has to redo. The fastest path:

  1. Call `creation_create` to open the row (status `pending`) so the
     question is anchored to a real creation.
  2. Call `creation_ask` with structured options — the user picks in
     one click, no freeform typing required.
  3. End your turn. The next turn arrives with the answer; read it
     via `creation_get` and proceed to Step 2.

Reach for `creation_ask` whenever you would otherwise ask the user a
choice question in prose. Pickable options round-trip faster, give
the user a clear sense of the brief, and survive history pruning.
See the `creation_ask.py` section below for the full usage policy.

**Step 1 — `creation_create`.** Open a row with the right `--type`
(image / video / audio / file). Capture the returned `id` — every
subsequent call needs it. The row lands in `pending`.

**Step 2 — flip to running.** Run
`creation_update --id <id> --status running --progress 0 --message "<starting>"`
so the user's Preview Card shows the spinner instead of a stale
"queued" pill.

**Step 3 — generate + report progress (loop).** While generating, push
intermediate updates whenever the underlying generator emits progress:

    creation_update --id <id> --progress 30 --message "stylizing colours"
    creation_update --id <id> --progress 70 --message "upscaling"

If the generator gives you a percentage, mirror it. If it gives only
phase names, set `--progress` to a rough share (e.g. 25 / 50 / 75) and
put the phase in `--message`. If it gives nothing, send at least one
mid-run update so the user knows you're alive. Outputs that come back
as a URL (Sora video, generator image, etc.) must be downloaded to
disk **before** the next step.

**Step 4 — attach.** Run `creation_attach --id <id> --file <path>` to
upload the deliverable. **This is the most-skipped step** — without
it the row has no artifact and the user sees "no output".

**Step 5 (success) — done.** Run
`creation_update --id <id> --status done --progress 100 --message "<one-line summary>"`.
Then reply in chat with a brief confirmation. Don't list everything
you did; the Preview Card already shows it.

**Step 5 (failure) — fail with a reason.** If anything in steps 1–4
fails irrecoverably (model timeout, content-policy refusal, missing
input, etc.), do BOTH of these — neither alone is acceptable:

  (a) `creation_update --id <id> --status failed --message "<plain-language reason>"`
      so the card flips to the failed state with the reason visible.
  (b) Reply in chat explaining what went wrong, in 1–2 sentences,
      using the same reason. If a retry is reasonable, say so; if the
      user needs to change something (e.g. shorter prompt, different
      model), say what.

**Never silently abandon a row in `running`.** A creation stuck in
running spins forever in the UI. The Stalled cron eventually surfaces
it, but only after a long timeout. Always terminate the row yourself
with `done` or `failed`.

### `creation_create.py`

Open a new creation row. The id you get back is what every other
creation tool needs.

```
python scripts/creation_create.py \
  --mode creation \
  --type image \
  --title "Logo exploration v3"
```

`--mode` ∈ `creation` / `code`. `--type` must match the mode:
`vibe_code` for `code`; one of `image` / `video` / `audio` / `file`
for `creation`. Optional: `--source-message-id <id>` to link back to
the user turn that requested it, `--metadata '{...}'` JSON object for
type-specific fields.

### `creation_update.py`

Push status / progress / message updates as you work. The Preview Card
re-renders live.

```
python scripts/creation_update.py --id <id> --status running
python scripts/creation_update.py --id <id> --progress 45 --message "stylizing colours"
python scripts/creation_update.py --id <id> --status done
```

Legal status transitions are enforced server-side. Terminal states
(`done` / `failed` / `cancelled`) are sticky — if you need to re-do,
create a new row with the same `--source-message-id` instead.

### `creation_get.py`

Read a creation back. Use at the start of every turn that continues a
prior creation.

```
python scripts/creation_get.py --id <id>
python scripts/creation_get.py --id <id> --json
```

### `creation_list.py`

Browse your own creations (auto-scoped to this device + agent).

```
python scripts/creation_list.py --mode creation
python scripts/creation_list.py --mode code --status running
```

### `creation_attach.py`

Upload the *deliverable* (image / video / audio / file) as an
artifact attached to a creation. Same path the workspace skill uses
for `workspace_report_artifact` — local file → presigned PUT → S3.

```
python scripts/creation_attach.py \
  --id <creation_id> \
  --file /tmp/logo_v3.png \
  --label "hero variant"
```

If the deliverable came from a remote URL, download it locally first
(curl / wget) — server stores **files**, not links. Same rule as
`workspace_report_artifact`.

vibe_code source uploads (multi-file Vite tree) ship in Phase 3 via a
separate `vibecode_upload_files` tool — not handled here.

### `creation_ask.py`

**Use this tool liberally** — in creation mode, every real decision
that affects the deliverable should land as a `creation_ask` rather
than a guess or a freeform "what do you think?" sentence. The chat
opens a modal with all your questions as tabs; the user answers them
together in one round-trip; your next turn reads every answer back
via `creation_get`. This is faster and less error-prone than batting
ideas back and forth in plain prose.

**Batch every question into ONE turn.** Don't ask one question, end,
wait, ask the next. Call `creation_ask` 2–4 times in the same turn,
one per question you genuinely need answered before you can start.
The UI groups them into a single modal — the user answers them all
in one sitting and submits once. Drip-feeding wastes round-trips and
breaks the modal grouping.

**Match `[SC_USER_LANG:<code>]` exactly.** The user's locale is on
every turn — read it. Write `--question` and every
`--option <value>:<label>` in that locale's language. `zh-CN` →
Simplified Chinese, `zh-TW` → Traditional Chinese, `ja` → Japanese,
`en` → English. The `value` slug can stay ASCII; the `label` is
what the user sees in the modal and must be in their language. **Do
NOT default to English when the marker says otherwise** — this is
the single most-violated rule. If you draft a question in English
and the marker is `zh-CN`, translate the whole thing before
calling the script.

Example for a `zh-CN` user:

```
python scripts/creation_ask.py \
  --id <id> \
  --question "海报的画幅应该是哪种？" \
  --option landscape:"横版（16:9）" \
  --option portrait:"竖版（9:16）" \
  --option square:"方形（1:1）"
```

When to call it (non-exhaustive):

- **Before generation**, whenever the brief leaves a real choice open
  — aspect ratio, length, voice / language, format (PNG vs. SVG,
  PPTX vs. PDF), tone, target audience, palette, mood. If you'd
  otherwise have to ask "should I make this in landscape or
  portrait?" in plain text, call `creation_ask` instead.
- **Mid-flight**, when partway through generating you hit a
  branchpoint the user should pick (e.g. you've drafted two takes
  and want them to choose, or a tool returned an ambiguous result
  needing direction).
- **Before a destructive or expensive step** — re-running a video
  generation, switching models, re-rolling at higher resolution.

When NOT to call it:

- Trivia the user already answered upstream in the brief.
- Yes/no signoffs on something the brief already greenlit ("should
  I continue?").

```
python scripts/creation_ask.py \
  --id <id> \
  --question "Which mood should the fox have?" \
  --option sleepy:"Sleepy and curled up" \
  --option alert:"Alert, ears forward" \
  --option playful:"Playful, mid-pounce" \
  --allow-other --allow-custom-text
```

Flags:
- `--option <value>:<label>` — repeat per choice. 2–6 options is the
  sweet spot.
- `--allow-other` — adds a catch-all "Other" row. Pick this when the
  user might want something off your list.
- `--allow-custom-text` — only with `--allow-other`; reveals a text
  input under "Other" so the user can type a specific answer.

**After calling `creation_ask` (one or more times), end the turn
immediately. Do NOT print any reasoning, status message, or
"please wait" text — output nothing.** The modal is already showing
the user your questions; any extra text from you just clutters the
thread.

The next user turn will arrive in one of two shapes:

- **Answered** — a message starting with "Here are my answers to
  your questions:" followed by `Q:` / `A:` pairs, one per question
  you asked. Read it, then call `creation_get --id <id>` to confirm
  the answer landed on the row, and proceed.
- **Declined** — a message starting with "I closed the questions
  without answering." The questions are marked with
  `(user declined to answer)` on the server. Either pick reasonable
  defaults and continue, or re-ask in a different shape (fewer
  questions, simpler options) — don't repeat the exact same set.

### `creation_delete.py`

```
python scripts/creation_delete.py --id <creation_id>
```

User scope only. If you call this from your skill-bearer context the
server returns 403 — the right move is `creation_update --status
cancelled` instead.

## Capability registration

The platform stores your reported capabilities per (user, device, you,
mode) and renders them as chips above the composer. Two tools manage
this list — read with `capability_get`, write with `capability_register`.

### Mode-enter trigger: `[SC_CAPS_CHECK_V1]`

When the user switches to Creation or Code mode, the UI sends you a
**hidden housekeeping turn** that looks like:

```
[SC_MODE:CREATION]
[SC_CAPS_CHECK_V1]
[hidden system note — user just entered Creation mode. ...]
```

Both markers are stripped from the chat view — the user doesn't see
this turn, only your reply.

**Contract:** you MUST call `capability_register.py --mode <mode>`
before the turn ends, with **at least one capability entry**. Empty
arrays are rejected. Skipping the call is the single most common bug
here.

If you have no dedicated generator skill installed, you can always
write text — so register a `file` entry at minimum (handwritten
markdown reports, plain-text scripts, HTML/CSS posters). Then add
anything else you genuinely can produce on top of that floor.

The UI fires this housekeeping turn **only when the stored list is
empty** for the active mode — once chips exist the trigger won't
re-fire. The server upserts on (user, device, agent, mode), so
re-registering an unchanged list is a free no-op; the user can
always hit Rediscover to force a refresh.

The flow:

1. **Inventory (mandatory, first).** Enumerate every skill installed
   in your environment via the shell (`ls skills/` or your env's
   equivalent), then `head -60 <dir>/SKILL.md` on each. Identify the
   ones that produce media outputs for creation mode (image / video
   / audio / file generators) or vibe-code site scaffolders for code
   mode. Also include capabilities you can deliver **without** a
   dedicated skill — handwritten HTML/CSS, markdown, plain-text
   scripts. Do NOT rely on memory of which skills you've used; the
   user expects an exhaustive list.
2. **Register.** Pipe the JSON array of 3–8 entries to
   `capability_register.py --mode <mode>` (see the section below for
   the exact field shape).
3. **Reply.** Exactly one short sentence:
   `"Registered N capabilities for <mode> mode."` Do not list the
   entries — the UI renders them as chips.

Optional: you may run `python scripts/capability_get.py --mode <mode>`
first if you want to see what was previously registered. It's a read
that doesn't gate anything — the register call at step 2 still has to
happen either way.

### `capability_get.py`

```
python scripts/capability_get.py --mode creation
python scripts/capability_get.py --mode code --json
```

Returns the current registered list (or `null` if no row exists yet).

### `capability_register.py`

Tell the platform what types of artifacts you can create in a given
mode. Drives the chips above the composer ("What you want to create"
/ "What kind of site"). Call this whenever you decide (via the
[SC_CAPS_CHECK_V1] flow above) that the stored list is missing,
stale, or in any way out of sync with what you can actually do right
now.

**Each entry has five fields:**

| field | required | what |
|---|---|---|
| `type` | yes | One of `image`, `video`, `audio`, `file`, `vibe_code`. Must match the `--mode` you're registering for (vibe_code only for code; the four media types only for creation). |
| `label` | yes | Short human label, e.g. "Logo / wordmark". Shows on the chip. |
| `description` | yes | One-sentence description shown as the chip tooltip. |
| `example_prompts` | yes (≥1, ≤4) | Prompts you'd accept for this type. Used as a fallback when the user clicks a chip and no `related_skills` are set. |
| `related_skills` | recommended | Array of skill slugs (the names of skills installed on this agent that you'd reach for to generate this type). When present, the chip click sends the user a message of the form `"I want to generate <label>, related skills: <a>, <b>"` so on the next turn you read the hint and go straight to the right tool — no skill-selection guesswork. Empty array or omitted = no hint, falls back to `example_prompts[0]`. |

```
cat <<EOF | python scripts/capability_register.py --mode creation
[
  { "type": "image",
    "label": "Logo / wordmark",
    "description": "Clean SVG / PNG logos in your brand palette.",
    "example_prompts": [
      "Design a wordmark for ACME",
      "Tweak the logo with a teal accent"
    ],
    "related_skills": ["storyclaw-image-gen"]
  },
  { "type": "video",
    "label": "Short product clip",
    "description": "30–60s explainer / hero clips.",
    "example_prompts": ["Make a 30s hero clip for our homepage"],
    "related_skills": ["storyclaw-sora-bridge", "storyclaw-workspace-reporter"]
  }
]
EOF
```

Up to 8 entries per mode, ≤ 4 example_prompts each, ≤ 6
related_skills each.

**Don't lie about related_skills.** Only list skills you actually have
installed and can call. If you don't have a dedicated skill for an
artifact type, omit the field or send `[]` — the UI will fall back to
`example_prompts[0]` for the chip click prompt.

## Memory tools

You have access to a **cross-agent memory store** for the current user.
Every agent the user employs shares one library, scoped by visibility:

- **`shared`** — readable by every agent in the user's library, plus the
  user. Use this for facts that help *other* agents the user employs.
- **`agent_private`** (default) — only this agent and the user can see
  these. Use this for working notes that aren't useful outside this
  agent's tasks.

### When to save (`workspace_memory_save.py`)

When you notice a **long-lived** fact about the user, their project, or
their customers, save it.

- **Will reappear in future conversations** → save. Examples: user's
  language preference, project deployment, customer communication style,
  recurring acronyms, project codenames.
- **Solved this turn** → do not save. Examples: a variable value during
  debugging, a one-off calculation, the answer to a question.

```
python scripts/workspace_memory_save.py \
  --title "User language preference" \
  --body "Prefers Chinese replies, keeps technical terms in English." \
  --visibility shared \
  --key user.tone
```

Flags:

- `--title` (required, 5–10 words)
- `--body` (required, 1–2 sentences, ≤1 KB)
- `--visibility shared|agent_private` (default `agent_private`)
- `--key user.tone | customer.<name> | project.<name>` (optional normalized tag)
- `--tags <tag>` (optional, repeatable)

**Never** include API keys, tokens, passwords, private keys, mnemonics,
or government ID numbers — the server will reject the write, and you
shouldn't be capturing those facts in the first place.

### When to search (`workspace_memory_search.py`)

At the start of a non-trivial task, search for relevant context:

```
python scripts/workspace_memory_search.py --q "user's preferred reply language"
python scripts/workspace_memory_search.py --q "customer Alex" --limit 5
```

Pinned memories (`★`) always rank first regardless of similarity — these
are the user's contract-level rules.

### When to list (`workspace_memory_list.py`)

To browse what's saved without a specific query (e.g. before a fresh
task, to see what's pinned):

```
python scripts/workspace_memory_list.py --pinned        # only ★ pinned
python scripts/workspace_memory_list.py --visibility shared --limit 10
```

### When to delete (`workspace_memory_delete.py`)

If you previously saved a memory that turned out to be wrong or
obsolete, delete it. You can only delete memories *you* wrote — rows
authored by the user or by another agent are read-only from this
scope.

```
python scripts/workspace_memory_delete.py --id <memoryId>
```

## Agent self-package (`workspace_package_agent.py`)

When the user clicks "Package", run:

```
python scripts/workspace_package_agent.py --agent-id <your-agent-id>
```

That's it. The script shells out to
`npx --yes @storyclaw/talenthub@latest agent export <agentId>` and
uploads the resulting zip to the workspace. Talenthub owns
everything about what goes into the zip — file selection, exclusions,
manifest handling, size limits. This skill is just the delivery
mechanism.

If the script exits non-zero, surface its stderr verbatim and stop.
Do not try to package the agent any other way.

## Fields

- **title** — short, human-readable. What is it?
- **description** — one or two sentences. Why did you make it? What's useful?
- **output_process** — the short story of how it was produced (which
  tools, which prompts, what pipeline). This is what lets the user
  reproduce or extend the artifact later.
- **tags** — optional labels. Think `campaign-launch`, `q2-ads`, `wip`.

Describe the item as if you were writing a filename for the user —
clear, specific, useful three weeks from now.
