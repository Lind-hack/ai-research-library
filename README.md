# AI Research Library

A source-backed, day-by-day archive for AI, software, hardware, data centers, networking, energy/economy, security/policy, and social research.

## Architecture

- `index.html`, `styles.css`, and `app.js` are a dependency-free Vercel site.
- `data/research.json` is a public-safe snapshot generated from the VPS SQLite archive.
- The VPS daily newsletter stores the full edition and source records in SQLite.
- After each successful edition, the VPS snapshot sync commits changed JSON to this repository. Vercel deploys from the GitHub `main` branch.
- No Vercel CLI token is stored on the VPS.

## Source and social policy

Primary publisher pages remain the evidence for claims. Images are linked from publisher OpenGraph/Twitter metadata. Video links are publisher embeds when available, otherwise clearly labeled YouTube learning searches.

The social radar checks the named X targets every cycle and records YouTube, Instagram, and TikTok checks. Official API results are separated from public discovery leads. A public discovery result is never presented as confirmed evidence.

## Optional social-feed repository

RSSHub is included as the recommended optional connector for social feeds:

- Repository: https://github.com/DIYgod/RSSHub
- Documentation: https://docs.rsshub.app/
- X route source: https://github.com/DIYgod/RSSHub/blob/master/lib/routes/twitter/user.ts
- YouTube route source: https://github.com/DIYgod/RSSHub/blob/master/lib/routes/youtube/channel.ts

RSSHub X routes require configured authentication and YouTube routes work best with stable channel IDs. Instagram/TikTok routes are best-effort and may be blocked by platform anti-crawler changes.

## Local preview

Serve the static project with any HTTP server, for example:

```bash
python -m http.server 3000
```

Then open `http://localhost:3000`.
