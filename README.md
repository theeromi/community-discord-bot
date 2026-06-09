# dimandem-bot

A self-hostable Discord bot featuring XP and leveling, daily trivia, a virtual economy, moderation tools, voice-activity tracking, scheduled announcements, news feeds, and an optional OpenAI-powered chat command.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https%3A%2F%2Fgithub.com%2Ftheeromi%2Fcommunity-discord-bot&envs=DISCORD_TOKEN%2COPENAI_API_KEY%2CBOT_OWNER_ID%2CGUILD_ID&optionalEnvs=OPENAI_API_KEY%2CBOT_OWNER_ID%2CGUILD_ID&DISCORD_TOKENDesc=Bot+token+from+discord.com%2Fdevelopers%2Fapplications&OPENAI_API_KEYDesc=Optional%3A+for+the+%21ask+command&BOT_OWNER_IDDesc=Optional%3A+your+Discord+user+ID&GUILD_IDDesc=Optional%3A+server+ID+to+pin+the+bot+to)

> One-click deploy above gets a running bot in ~2 minutes. For self-hosting on your own machine, see [Quick start](#quick-start-without-docker) below.

## Features

- **XP & Levels** — earn XP for messages and voice time; configurable level thresholds and role rewards
- **Daily Trivia** (`!dailytest`) — scheduled daily questions with cooldowns
- **Economy** — virtual currency, daily/work commands, gambling games (`blackjack`, `coinflip`, `slots`), shop, gifts, leaderboards
- **Moderation** — `ban`, `kick`, `mute`/`unmute`, `clear`, `slowmode`, `bulk`, audit log
- **Voice Tracking** — automatic role rewards for time spent in voice channels
- **Scheduled Messages** — good morning, good evening, daily challenge, birthday announcements
- **News Feeds** — RSS-driven posts into configured channels at configured times
- **Reminders, Polls, Giveaways, AFK, Reputation, Achievements**
- **`!ask`** — optional OpenAI chat command (requires your own API key)
- **Health monitoring, analytics, automatic backups**

A full command list is available via `!help` once the bot is running.

> Looking for the long version with screenshots-style detail? See **[docs/SETUP.md](docs/SETUP.md)**.

## Prerequisites

- **Node.js 18+** (Docker option below skips this)
- **A Discord bot account** — create one at https://discord.com/developers/applications
- **(Optional)** An OpenAI API key for the `!ask` command — https://platform.openai.com/api-keys
- **(Optional)** Docker + Docker Compose for the containerised setup

### Discord application setup

In the Developer Portal for your application:

1. **Bot tab** → **Reset Token** → copy this into your `.env` as `DISCORD_TOKEN`
2. **Bot tab → Privileged Gateway Intents** — enable:
   - Server Members Intent
   - Message Content Intent
3. **OAuth2 → URL Generator** — pick scopes `bot` and `applications.commands`, then bot permissions:
   - Send Messages, Manage Roles, Manage Messages, Read Message History
   - Add Reactions, Embed Links, Use External Emojis
   - Ban Members, Kick Members, Moderate Members
4. Open the generated URL and invite the bot to your server.

## Quick start (without Docker)

```bash
git clone https://github.com/theeromi/community-discord-bot.git
cd dimandem-bot

# 1. Configure
cp .env.example .env                 # then edit .env
cp config.example.js config.js       # then edit config.js

# 2. Install dependencies
npm install

# 3. Initialise the SQLite database
node init-database.js

# 4. Start the bot
npm start
```

## Quick start (with Docker)

```bash
git clone https://github.com/theeromi/community-discord-bot.git
cd dimandem-bot

cp .env.example .env                 # edit .env
cp config.example.js config.js       # edit config.js

docker compose up -d --build
docker logs -f dimandem-bot
```

## Configuration overview

All non-secret settings live in `config.js`. The big knobs:

| Section | What it controls |
|---|---|
| `prefix` | Command prefix (default `!`) |
| `generalChannelId` / `generalChannelName` | Where welcome and scheduled messages post |
| `rulesChannelName` | Channel referenced in welcome messages |
| `dailyChallengeHour`, `birthdayCheckHour`, etc. | Schedule times in 24h |
| `newsFeeds` | RSS channels and post hours |
| `levelThresholds` / `levelRoles` | XP-to-role mapping |
| `voiceRoles`, `messageRoles` | Activity-based role rewards |

See `config.example.js` for the full annotated template.

## Current limitations

- **Customisable, with community-themed defaults.** Welcome messages, level-up messages, birthday announcements, voice-role rewards, the `!ask` AI persona, virtual currency naming, and the `!work` job list are all driven by `config.branding` — edit your `config.js` to retheme. Default level role names (`Level 1 Yardie`, etc.) live in `config.levelRoles` — rename them there.
- **Single-guild design.** Each bot instance serves one server. Set `GUILD_ID` in `.env` to bind to a specific server; the bot otherwise targets whichever server it joined first.
- **Holiday announcements** are built-in for US/Christian holidays. Set `branding.holidaysEnabled: false` in `config.js` to disable, or edit the `getHolidays()` function in `index_enhanced.js` to customise.
- **Channel resolution.** Some scheduled jobs look up channels by hardcoded name; if your `general` or `rules` channel is named differently, edit `config.js` accordingly.

## Cost note (OpenAI)

The `!ask` command uses the OpenAI Chat Completions API (`gpt-3.5-turbo`, capped at 200 output tokens, rate-limited to 3 requests per user per 5 minutes). If you set `OPENAI_API_KEY`, **you** pay for the usage on your own OpenAI account. Leave it blank to disable the command.

## Deploy to Railway (one click)

Use the **Deploy on Railway** button at the top of this README. Railway will:

1. Fork the repo into your account
2. Build the Docker image automatically
3. Prompt you for `DISCORD_TOKEN` (required) and optional `OPENAI_API_KEY`, `BOT_OWNER_ID`, `GUILD_ID`
4. Spin up the bot — you'll see it come online in your Discord server within 1-2 minutes

**Persistent storage (important):** After the first deploy, go to your Railway service → **Settings → Volumes** → add a 1GB volume mounted at `/app/data`. Then in **Variables**, add `DB_PATH=/app/data/dimandem.db`. Without this step, your XP / economy / member data resets every time Railway redeploys.

**Cost:** Railway's free tier ($5/month execution credit) is plenty for a small Discord bot. Expect to use ~$2-3/month of credit at small server sizes. Bigger servers may need to upgrade to the Hobby plan ($5/month flat).

## Updating

```bash
cd dimandem-bot
git pull
npm install                           # if package.json changed
docker compose up -d --build          # if running via Docker
```

On Railway, push to your fork's `main` and Railway redeploys automatically.

## License

MIT — see [LICENSE](LICENSE).
