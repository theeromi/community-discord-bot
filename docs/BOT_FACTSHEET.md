# Bot Fact Sheet — community-discord-bot

> **Purpose of this file:** Ground-truth reference for writing/checking any blog post, marketing copy, or documentation about this bot. Every claim here is verified against the actual code. When writing a post, pull facts from here — don't guess.
>
> **Public repo:** https://github.com/theeromi/community-discord-bot
> **License:** MIT
> **Last verified:** against the code in this repo at time of writing.

---

## One-line description

A free, self-hostable Discord bot for community servers — XP & leveling, daily trivia, a virtual economy, full moderation tools, voice tracking, scheduled announcements, news feeds, and optional AI chat.

## What it is

A complete, production-tested Discord bot you run on your own server (a VPS, a Raspberry Pi, or a cloud platform). It's been running a live community for months. Fully configurable — every community-specific name, role, and message lives in config so you can re-theme it for your own server.

## Tech facts (verified)

| Item | Value |
|---|---|
| Language | Node.js (requires v18+) |
| Discord library | discord.js v14 |
| Database | SQLite (local file, no external DB needed) |
| Dependencies | discord.js, node-schedule, openai, rss-parser, sqlite3, dotenv |
| Total commands | 47 |
| Container | Docker + Docker Compose included |
| Deploy options | One-click Railway, Docker Compose (dev + prod), native Node.js |
| AI features | Optional — needs your own OpenAI API key, bot works fully without it |

## Full feature list (verified against code)

### XP & Leveling
- Earn XP from messages and voice activity
- Configurable XP thresholds and level-up roles (7 default level tiers)
- Automatic role assignment on level up

### Economy (virtual currency)
- Virtual currency with configurable name (default "$JMD")
- `!daily` — daily reward with streak bonuses
- `!work` — earn currency on a cooldown (configurable job scenarios)
- `!balance`, `!bank` (deposit/withdraw), `!gift` (send to others), `!richest` (leaderboard)
- Shop with purchasable items (`!shop`, `!inventory`)
- Gambling minigames: `!blackjack`, `!slots`, `!coinflip`

### Games & Fun
- Daily trivia challenge (`!dailytest` / `!trivia`) with rewards
- `!twotruths` — two truths and a lie
- `!8ball`, `!poll`, `!giveaway`

### Moderation
- `!ban`, `!kick`, `!mute`/`!unmute`, `!clear`, `!slowmode`
- `!bulk` — mass moderation actions
- `!announce` — formatted announcements with audience targeting (@everyone, @here, specific roles, or silent)
- Full audit logging

### Social & Community
- `!rep` — reputation system
- `!achievements` — unlockable badges
- `!remindme` — personal reminders
- `!afk` — AFK status
- `!setbirthday` + automatic birthday announcements

### Roles & Progression (3 automated systems)
- Level roles (XP-based) — 7 tiers
- Voice roles (voice-time-based) — 4 tiers
- Message roles (chat-activity-based) — 5 tiers
- All assigned automatically, all configurable

### Scheduled / Automatic
- Good morning + good evening messages (optionally AI-generated)
- Birthday announcements
- Holiday announcements (configurable, can be disabled)
- RSS news feeds posted to configured channels at configured hours

### Stats & Info
- `!mystats` / `!profile` / `!profilecard` — user profiles
- `!leaderboard`, `!voiceleaderboard`
- `!serverinfo`, `!userinfo`
- `!analytics` (admin) — command usage stats
- `!health` (admin) — system health
- Automatic daily database + code backups

### AI (optional)
- `!ask` — OpenAI-powered chat command (needs your own key)
- AI-generated motivational morning/evening messages (falls back to static text if no key)

## Cost facts (be accurate — don't overpromise)

| Item | Cost |
|---|---|
| The bot itself | Free, open source (MIT) |
| Discord bot account | Free |
| Hosting on a Raspberry Pi | Free (you already own it) |
| Hosting on a VPS | ~$5/month |
| Hosting on Railway free tier | Free for small servers (~$2-3/mo of free credit used) |
| OpenAI (optional, for !ask) | Pay-as-you-go on your own key, ~$1-3/month at small-server usage. Bot works fully without it. |

## Setup facts (verify steps before publishing)

Two ways to run it:

**One-click (Railway):**
- Click the "Deploy on Railway" button in the README
- Paste your Discord bot token when prompted
- **Important caveat to mention:** must add a persistent volume + set `DB_PATH=/app/data/dimandem.db` or data resets on redeploy

**Self-host (Docker):**
```
git clone https://github.com/theeromi/community-discord-bot.git
cd community-discord-bot
cp .env.example .env          # add Discord token
cp config.example.js config.js
docker compose up -d --build
```

Full guide: `docs/SETUP.md` in the repo.

## What an operator needs (be upfront)

- Their own Discord bot token (free, from discord.com/developers)
- To enable two "privileged intents" in the Discord portal (Server Members + Message Content)
- A place to run it (Pi, VPS, or cloud)
- Optional: their own OpenAI key for `!ask`

## Honest limitations (include these — credibility)

- One bot instance serves one Discord server (not multi-server)
- Default theme is community-specific (Jamaican-themed names/currency) — re-theme via config
- Uses message-prefix commands (`!`) not slash commands — fine for small servers, but Discord prefers slash commands for bots in 100+ servers
- Holiday announcements default to US/Christian holidays (can be disabled)

## Links to use in the post

- Repo: https://github.com/theeromi/community-discord-bot
- Setup guide: https://github.com/theeromi/community-discord-bot/blob/main/docs/SETUP.md
- Issues / support: https://github.com/theeromi/community-discord-bot/issues

## Claims to NEVER make (accuracy guardrails)

- ❌ Don't say "works on multiple servers at once" — it's single-guild
- ❌ Don't say "no setup needed" — operators need a Discord token + intents enabled
- ❌ Don't say "free AI included" — AI needs the operator's own OpenAI key
- ❌ Don't link the private `dimandem-bot` repo — always link `community-discord-bot`
- ❌ Don't claim specific user counts or uptime stats unless you verify them
