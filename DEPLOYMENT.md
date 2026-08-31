# Deployment contract

This project is deployed by Vercel's GitHub integration from `main`.

The VPS writes only `data/research.json` after a successful daily edition. The JSON contains source URLs, evidence excerpts, public image/video links, category labels, daily edition text, and social-check status. It never contains API keys, SMTP credentials, SQLite files, or Vercel tokens.

The interface is static by design. The durable source database remains SQLite on the VPS; the Vercel site is the searchable public-safe view of its exported history.
