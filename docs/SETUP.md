# Setup Guide

A step-by-step walkthrough for installing dimandem-bot on your own server. The [README](../README.md) has the short version; this is the full one.

## What you'll need

- A Discord server you administer
- About 10 minutes
- A computer or VPS that can run Node.js 18+ (a Raspberry Pi or any cheap VPS works fine)
- **(Optional)** An OpenAI account if you want the `!ask` command — you pay for your own API usage

## Step 1 — Create the Discord application

1. Go to **https://discord.com/developers/applications** and sign in.
2. Click **New Application**, give it a name, and create it.
3. Go to the **Bot** tab on the left.
4. Click **Reset Token** and copy the token somewhere safe — you'll paste it into `.env` in a few minutes. (You can only view the token once; if you lose it, reset again.)
5. Scroll down to **Privileged Gateway Intents** and turn on:
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent**
   - (Presence Intent isn't required.)
6. Save changes.

## Step 2 — Invite the bot to your server

1. Still in the Developer Portal, go to **OAuth2 → URL Generator**.
2. Under **Scopes**, tick:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Under **Bot Permissions**, tick:
   - **General**: Manage Roles, Manage Channels (optional), Read Messages/View Channels
   - **Text**: Send Messages, Embed Links, Attach Files, Read Message History, Add Reactions, Use External Emojis, Manage Messages
   - **Voice**: Connect, Speak (only if you'll use voice features)
   - **Moderation**: Kick Members, Ban Members, Moderate Members (timeout)
4. Copy the generated URL at the bottom, paste it into your browser, and authorize the bot for your server.

> **Important:** The bot's role in your server's role list must be **above** any role it's expected to assign or manage. After the bot joins, drag its role up in **Server Settings → Roles**.

## Step 3 — Get the code

```bash
git clone https://github.com/theeromi/community-discord-bot.git
cd dimandem-bot
```

## Step 4 — Configure

### Environment variables

```bash
cp .env.example .env
nano .env        # or any editor you like
chmod 600 .env   # so other users on the system can't read your tokens
```

Fill in:

- `DISCORD_TOKEN` — the token from step 1
- `OPENAI_API_KEY` — paste your key from https://platform.openai.com/api-keys, or leave blank to disable `!ask`
- `BOT_OWNER_ID` — your Discord user ID (enable Developer Mode in Discord, then right-click your name → Copy User ID)
- `GUILD_ID` — your Discord server ID (right-click your server icon → Copy Server ID). Optional but recommended — if you skip it, the bot uses whichever server it joined first, which is fine for most single-server setups.

### Bot configuration

```bash
cp config.example.js config.js
nano config.js
```

Replace every `REPLACE_ME` with a real value. To get Discord channel/role/server IDs:

1. Open **Discord → Settings → Advanced → Developer Mode** and turn it on.
2. Right-click any channel, role, user, or server → **Copy ID**.

Most servers only need to fill in:
- `generalChannelId` — where welcome messages and scheduled posts go
- `rulesChannelName` — name of your rules channel (e.g., `rules`, `read-this-first`)

The prayer-forum and news-feed sections are optional — if you don't have those channels, leave the IDs as `REPLACE_ME` and the bot will skip them.

## Step 5 — Run it

### Option A — Native Node.js

```bash
npm install
node init-database.js   # creates the SQLite database
npm start
```

The bot prints log lines as it starts. When you see something like `Logged in as YourBot#1234`, you're live.

### Option B — Docker (development)

The shipped `docker-compose.yml` bind-mounts your working directory into the container so you can edit files and restart for fast iteration.

```bash
docker compose up -d --build
docker logs -f dimandem-bot
```

Press Ctrl+C to stop watching the logs (the bot keeps running). To stop the bot completely: `docker compose down`.

### Option C — Docker (production)

For a production deployment use `docker-compose.prod.yml` instead. It does **not** mount your source into the container, stores the SQLite DB on a named volume that survives rebuilds, and caps log size.

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f
```

To upgrade later:
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Option D — Cloud platforms

The bot runs on any Node.js 18+ host. Three popular options:

- **Railway** (https://railway.app) — connect the GitHub repo, set the env vars from `.env.example` in the project's Variables panel, and Railway picks up the `Dockerfile` automatically. For SQLite persistence add a volume and set `DB_PATH=/data/dimandem.db`.
- **Render** (https://render.com) — create a "Background Worker" pointing at the repo, set the start command to `node index_enhanced.js`, add the env vars, and attach a persistent disk mounted at e.g. `/data` with `DB_PATH=/data/dimandem.db`.
- **Fly.io** (https://fly.io) — `fly launch` from the repo, accept the Dockerfile detection, attach a 1 GB volume to `/data`, and set `DB_PATH=/data/dimandem.db` via `fly secrets set`.

All three have free trials but **persistent disks are the gotcha**: on free tiers data is wiped on redeploy. For real use, expect ~$2–7/month.

## Step 6 — Verify

In a channel where the bot can post, type:

- `!ping` → should reply with latency
- `!help` → should show the command list
- `!info` → server info

If nothing happens:

- Check the bot is online in your member list (green dot)
- Check the logs for errors
- Verify the bot has Send Messages permission in that channel

## Updating later

```bash
cd dimandem-bot
git pull
npm install                       # only if package.json changed
docker compose up -d --build      # if running via Docker
```

## Common issues

### "Used disallowed intents" on startup
You forgot to enable Server Members Intent or Message Content Intent in the Developer Portal. Go back to step 1, point 5.

### Bot is online but commands don't work
- Confirm Send Messages permission in the channel (right-click channel → Edit Channel → Permissions)
- Confirm you're using the right prefix (default `!` — change in `config.js`)
- Check the logs for command-execution errors

### Roles aren't being assigned
- Bot needs Manage Roles permission
- The bot's role must be **above** the roles it's trying to assign in the role hierarchy
- Role names in `config.js` (`levelRoles`, `voiceRoles`, `messageRoles`) must match exactly — capitalization counts

### "Cannot find module …"
Run `npm install` again.

### Database errors
Run `node init-database.js` to (re)initialise the schema. Your existing data gets backed up to a timestamped `.db` file before anything is overwritten.

### `!ask` says "AI features are not configured"
You haven't set `OPENAI_API_KEY` in `.env`. Add it and restart the bot.

## Cost expectations

| Item | Cost |
|---|---|
| Discord bot account | Free |
| OpenAI for `!ask` | Pay-as-you-go on your own key. The bot uses `gpt-3.5-turbo`, capped at 200 output tokens, rate-limited to 3 requests per user per 5 minutes. A small server typically costs cents per day. |
| Hosting | A $5/month VPS or a Raspberry Pi at home is plenty. The bot uses ~100 MB RAM. |

## Where to get help

- Open an issue on GitHub: https://github.com/theeromi/community-discord-bot/issues
- Read the source — it's well-commented JavaScript and not very large
