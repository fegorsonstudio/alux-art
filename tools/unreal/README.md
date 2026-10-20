# The Alux Unreal studio

Unreal Engine is the picture studio for Alux Micro Drama: permanent sets
(boardroom, bridge, old houses), the same actors in every episode (MetaHumans),
cinema lighting, and real 3D brand products. It makes **still pictures only**;
the game and the posts stay on the website.

Written 2026-10-20. Nothing here has run yet — it needs a graphics machine,
which needs the free cloud credits (CREDITS.md). Each step says how it is
checked the first time.

## How a picture travels

```
tools/drama/shotlist.mjs  ──►  shots.json (who, framing, mood, words, 2160×2700)
        │                              │ copied to the studio machine
        ▼                              ▼
/admin/drama  ◄── scripts/drama-attach-art.mjs ◄── renders 01.png … 08.png
 (Preview → Approve → Schedule)           (Unreal, staged by Claude through Epic's MCP)
```

1. `node tools/drama/shotlist.mjs <story> <episode> --out shots.json` — the brief.
2. On the studio machine, Claude (through Epic's Unreal MCP) builds or loads the
   set, places the actors and lights, and for each shot runs
   `alux_drama.shoot(shot)` from `python/alux_drama.py`, which saves
   `C:\AluxStudio\renders\<story>\ep<n>\NN.png` at 2160×2700.
3. The renders are copied to the app server and attached:
   `node --env-file=.env.local scripts/drama-attach-art.mjs <story> <episode> <folder>`.
   (Or upload them by hand on /admin/drama → Pictures.)
4. On /admin/drama: Preview — the words now sit on the pictures — Approve, Schedule.

## The machine

What to rent (any one; prices are pay-as-you-go before credits, roughly):

| Provider | Machine | GPU | Approx. |
|---|---|---|---|
| Azure | NV36ads A10 v5 (or NC4as T4 v3 for a start) | NVIDIA A10 24 GB (T4 16 GB) | $1.0–3.2 / hour |
| AWS | g5.xlarge (or g4dn.xlarge for a start) | A10G 24 GB (T4 16 GB) | $0.5–1.0 / hour |
| Google Cloud | g2-standard-8 | L4 24 GB | about $0.9 / hour |

- **Windows Server 2022** with the provider's NVIDIA driver image, **8 vCPU, 32 GB RAM,
  300 GB SSD** (Unreal 5.8 + MetaHumans + one project is about 150 GB).
- **Switch it off when not in use.** The disk still costs a little while it is off
  (about $15–25 a month for 300 GB); running time is what spends the credits.
- GPU machines usually need a quota request first ("GPU quota" / "service limit") —
  ask for 1 GPU in one region; it can take 1–3 days.

## First setup (once)

1. Create the machine, open RDP (3389) and SSH (22) to **the owner's IP only**.
2. On the machine, in PowerShell as Administrator:
   `Set-ExecutionPolicy -Scope Process Bypass; .\vm-bootstrap.ps1 -PublicKey "<laptop's ~/.ssh/id_ed25519.pub>"`
   Installs Git, Node, the Epic Games Launcher and OpenSSH Server, and lets the
   laptop's key in. *Checked by:* `ssh studio@<ip> hostname` from the laptop.
3. The owner signs in to the **Epic Games Launcher** (free account) and installs
   **Unreal Engine 5.8** (with "Editor symbols" off to save space).
4. Create a project **AluxDramaStudio** (Film / Video & Live Events → Blank, Starter
   Content off) in `C:\AluxStudio\AluxDramaStudio`.
5. Edit → Plugins: enable **Unreal MCP**, **All Toolsets**, **Python Editor Script
   Plugin**, **MetaHuman** (and **Movie Render Queue** for later). Restart.
6. Edit → Editor Preferences → General → Model Context Protocol → **Auto Start
   Server** on. In the console: `ModelContextProtocol.GenerateClientConfig ClaudeCode`.
   *Checked by:* `curl http://127.0.0.1:8000/mcp` on the machine answers.
7. Copy `python/alux_drama.py` into `C:\AluxStudio\AluxDramaStudio\Content\Python\`.

## Connecting Claude (each session)

Epic's MCP server only accepts connections from the same machine and has no
password, so it is reached through an encrypted SSH tunnel, never opened to the
internet:

```bash
bash tools/unreal/tunnel.sh <studio-ip>      # keeps 127.0.0.1:8000 on the laptop → the studio's 127.0.0.1:8000
```

Then this entry goes in the laptop's `.mcp.json` (the owner's private file, never
committed) — add it only once the studio exists, or every Claude session will
report a failed server:

```json
"unreal": { "type": "http", "url": "http://127.0.0.1:8000/mcp" }
```

*Checked by:* a new Claude session lists the Unreal tools; `ActorTools` spawns a cube.

## Skills to add once it runs

`quodsoler/unreal-engine-skills` (27 Unreal skills — materials and rendering,
Sequencer, UMG; ~300 stars, updated June 2026) — third-party: read each
`SKILL.md` before installing, install only the rendering/materials/sequencer ones.
