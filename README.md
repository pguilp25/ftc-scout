# FTC Scouting site

A lightweight, custom scouting app for your FTC team. Scouts record match stats on
their phones, the app compiles everything, ranks the **best alliance partners for
your robot**, and draws per-team charts. Built for the **FTC Edmonton Premier**
event but works for any event, anywhere in the world.

- **No build step, no framework.** Plain HTML + JavaScript.
- **Works offline for testing** — just open `index.html`.
- **Deploys as static files** to any host (Vercel, Netlify, GitHub Pages…).
- **One config file** (`js/config.js`) defines every stat → form, list, charts, and
  ranking all update from it.

---

## 1. Try it right now (no accounts)

Double-click `index.html`, **or** serve it locally (recommended):

```bash
cd ftc-scout
python3 -m http.server 8000
# then open http://localhost:8000
```

Data is saved in that browser's local storage. Great for solo testing, but each
device has its own separate data. To let a whole scouting crew share one dataset,
set up Supabase (step 3).

---

## 2. Customize your stats — `js/config.js`

This is the only file you need to touch. Each entry in `metrics` becomes a field on
the scout form and a column/chart everywhere else. Change the DECODE defaults to
match how your team thinks about the game:

- `points` — game points one unit is worth (used for the score-trend chart).
- `weight` — default importance in the **"best team for us"** ranking (you can also
  tune this live with sliders in the app).
- `norm` — for number stats, the value that counts as "excellent" (scales ranking).
- `options` — for the endgame dropdown, the choices and their point values.

Set `myTeam` to your team number and `eventName` to your event.

---

## 2b. Team names — the event roster (`js/roster.js`)

Team names are resolved automatically from the number (via ftcscout.org) and
cached. To make them **instant and offline-proof** for your event, hardcode the
roster in `js/roster.js` — one line per team:

```js
FTC.ROSTER = {
  "17070": "EVOLUTION",
  "14584": "Pioneer 327",
};
```

Any number not listed still works (it falls back to a one-time lookup), so this
list is purely a speed boost. Paste your event's team list here before competition.

## 3. Share data across scouts (Supabase — free)

1. Create a free project at **https://supabase.com**.
2. In the project: **SQL Editor → New query**, paste the contents of
   `supabase-schema.sql`, and click **Run**. (Creates the `scouting` table.)
3. Go to **Settings → API** and copy:
   - **Project URL**  → paste into `supabaseUrl` in `js/config.js`
   - **anon public key** → paste into `supabaseAnonKey` in `js/config.js`
4. Reload the site. The badge in the header flips to **☁ shared**. Every scout who
   opens the site now reads and writes the same data.

> The anon key is *meant* to be public. It only allows the scouting-table access
> defined in the SQL policies — no secrets are exposed. If you later want to
> restrict who can write, enable Supabase Auth and tighten the policies.

---

## 4. Put it online for everyone — Vercel (free)

**Option A — drag & drop (easiest):**
1. Zip the `ftc-scout` folder (or just its contents).
2. Go to **https://vercel.com**, sign in with GitHub, **Add New → Project →
   deploy**, and drop the folder. It's static, so there's nothing to configure.

**Option B — from GitHub (best for updates):**
```bash
cd ftc-scout
git init && git add . && git commit -m "FTC scouting site"
# create a repo on github.com, then:
git remote add origin https://github.com/YOURNAME/ftc-scout.git
git push -u origin main
```
Then in Vercel: **Add New → Project → import that repo → Deploy.** Framework preset:
**Other** (it's plain static). Every `git push` auto-redeploys.

Netlify and GitHub Pages work exactly the same way — it's just static files.

Once deployed you get a URL like `your-team.vercel.app` that anyone in the world can
open. Because Supabase holds the data, all scouts see the same numbers live.

---

## Files

| File | What it does |
|------|--------------|
| `index.html` | Page shell + script order |
| `js/config.js` | **Your stats & settings** (edit this) |
| `js/stats.js` | Aggregation, score estimate, "fit for us" ranking |
| `js/charts.js` | Dependency-free SVG charts |
| `js/store.js` | Data layer (local storage ↔ optional Supabase) |
| `js/app.js` | The UI |
| `css/styles.css` | Styling + light/dark palette |
| `supabase-schema.sql` | Run once in Supabase to create the table |

## Tips

- **Venue wifi is flaky.** If Supabase is on and the network drops, the app keeps
  writing to the device and shows the cached data; those rows sync to the cloud only
  on saves that get through. For a big event, having 1–2 scouts also **Export** their
  data (All teams → Data → Export) at the end of the day is a good backup.
- **Auto-fill schedules later:** you can pull the Edmonton team list & match schedule
  from the official FTC Events API or ftcscout.org — ask and I'll wire it in.
