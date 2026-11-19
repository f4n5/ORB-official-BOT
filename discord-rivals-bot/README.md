# Crypt3d Web (Render only)

Lightweight **Express** service for Render: web pages + Crypt3d desktop API.  
**No Discord.js gateway** — lower memory, fewer crashes on free Render.

Your full bot (slash commands, AutoMod, events) stays on the **other host**.

## What this hosts

| Route | Purpose |
|-------|---------|
| `GET /ping` | Keep-alive for UptimeRobot |
| `GET /` | Simple status page |
| `GET /captcha` | CAPTCHA page (verify token from bot) |
| `POST /captcha` | Submit CAPTCHA → assign Miembro via REST |
| `POST /api/app/link` | Desktop app consumes `/app-link` code |
| `GET /api/app/status` | Desktop app checks verification |
| `POST /api/internal/create-link` | **Your bot** creates a code for a user |

## Deploy on Render

1. New **Web Service**, Node, root = this folder  
2. Build: `npm install`  
3. Start: `npm start`  
4. Set env vars from `.env.example`  
5. UptimeRobot → `https://YOUR-SERVICE.onrender.com/ping` every 5 min  

## Wire your bot (other host)

When user runs `/app-link`, the bot should:

```js
// After checking Member role:
const res = await fetch(`${process.env.CRYPT3D_WEB_URL}/api/internal/create-link`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Bot-Key': process.env.BOT_INTERNAL_KEY
  },
  body: JSON.stringify({
    discordId: interaction.user.id,
    username: interaction.user.username
  })
});
const data = await res.json();
// data.code → show to user
```

Set on the bot host:
```env
CRYPT3D_WEB_URL=https://your-service.onrender.com
BOT_INTERNAL_KEY=same_as_on_render
```

Crypt3d desktop **Bot API URL** = same `PUBLIC_URL` on Render.

## Why split?

Render free tier sleeps and has low RAM. Gateway bots + Express together often fail.  
Web stays on Render; gateway bot on a VPS/panel that stays online.
