# Blog Post Draft — for your Ghost site

> **How to use this file:**
> - This is a ready-to-paste first draft. Copy the content below the line into your Ghost editor.
> - Edit the voice to sound like you — it's intentionally plain so you can add personality.
> - Everything here is fact-checked against `BOT_FACTSHEET.md`. If you change a claim, check it against that file.
> - Placeholders in `[brackets]` need your input.
> - When done, use the Ghost "Share preview" link and paste it into a fresh Claude chat with "review this for accuracy and clarity" — alongside `BOT_FACTSHEET.md` so Claude checks against ground truth.

---

## Suggested Ghost settings

- **Title:** Free, Self-Hostable Discord Bot — XP, Trivia, Economy & More
- **Excerpt/subtitle:** A complete community Discord bot you run on your own server. Open source, free, set up in minutes.
- **Feature image:** A screenshot of the bot in action (e.g. `!mystats` or `!help` output) works great
- **Tags:** Discord, Open Source, Self-Hosting, Bots
- **URL slug:** free-discord-community-bot

---

## POST CONTENT (paste below this line)

I've been running a Discord bot for my community for a while now, and it's grown into something genuinely useful — XP and levels, a virtual economy, daily trivia, full moderation tools, and a bunch more. It's stable enough now that I want to share it. It's free, open source, and you can run it on your own server.

Here's what it does and how to get it running.

### What it does

**Leveling & XP** — Members earn XP from chatting and hanging out in voice channels, and automatically get roles as they level up. Three separate progression systems (XP levels, voice-time roles, message-count roles), all assigned automatically.

**A virtual economy** — Your server gets its own currency. Members earn it with daily rewards and a `!work` command, gamble it in blackjack/slots/coinflip, buy items from a shop, gift it to friends, and compete on a wealth leaderboard.

**Daily trivia** — Automatic daily trivia challenges with currency and XP rewards.

**Moderation tools** — Ban, kick, mute, clear messages, slowmode, bulk actions, and a clean `!announce` command for server-wide announcements. Everything's logged.

**Community features** — Reputation, achievements/badges, reminders, polls, giveaways, AFK status, and automatic birthday announcements.

**Scheduled messages** — Good morning and good evening messages, birthday shoutouts, holiday announcements, and RSS news feeds posted to whatever channels you choose.

**Optional AI** — If you add your own OpenAI key, members can chat with the bot via `!ask`, and the morning/evening messages get AI-generated. Totally optional — the bot works fully without it.

That's 47 commands in total. Once it's running, `!help` shows everything.

### What it costs

The bot is free and open source (MIT licensed). Beyond that:

- **Hosting:** A Raspberry Pi you already own costs nothing. A small VPS is about $5/month. Railway's free tier works for small servers.
- **OpenAI (optional):** Only if you want the AI features. Pay-as-you-go on your own key — usually $1-3/month for a small server. Skip it and everything else still works.

### How to set it up

There are two ways.

**The easy way — one click:** There's a "Deploy on Railway" button on the GitHub page. Click it, paste your Discord bot token, and you've got a running bot in a couple of minutes. (One thing to know: add a persistent volume in Railway and set `DB_PATH=/app/data/dimandem.db`, or your data resets when Railway redeploys. The setup guide explains it.)

**The self-host way — Docker:**

```
git clone https://github.com/theeromi/community-discord-bot.git
cd community-discord-bot
cp .env.example .env          # add your Discord token here
cp config.example.js config.js
docker compose up -d --build
```

Either way, you'll need a free Discord bot token (from the [Discord Developer Portal](https://discord.com/developers/applications)) and you'll need to enable two "privileged intents" — the full walkthrough is in the [setup guide](https://github.com/theeromi/community-discord-bot/blob/main/docs/SETUP.md).

### A few honest notes

- One bot instance runs one Discord server. It's not built for hosting across many servers at once.
- The default theme is from my own community, so some role names and the currency are themed — but everything's in a config file, so you can rename it all to fit your server.
- It uses `!` commands (not slash commands). That's fine for most servers.

### Get it

**Repo:** [github.com/theeromi/community-discord-bot](https://github.com/theeromi/community-discord-bot)

It's open source, so feel free to fork it, tweak it, or open an issue if you hit a snag. If you end up using it on your server, I'd love to hear about it.

[Optional closing — add your own call to action: link to your Discord, ask people to star the repo, etc.]

---

## END OF POST CONTENT

### Pre-publish checklist (do these before hitting Publish)

- [ ] Repo link is `community-discord-bot` everywhere (NOT the private `dimandem-bot`)
- [ ] Added at least one screenshot of the bot in action
- [ ] Replaced the `[Optional closing]` placeholder or removed it
- [ ] Voice edited to sound like you
- [ ] Reviewed via Ghost preview link in a fresh Claude chat (paste BOT_FACTSHEET.md too)
- [ ] Tested the Railway button yourself with a throwaway Discord app (optional but recommended)
- [ ] Tags + feature image set in Ghost
