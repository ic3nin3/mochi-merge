# 🍡 Mochi Merge — Play Store Deployment Runbook

Everything is prepared in this repo: Capacitor Android project, icons, CI
pipeline (`.github/workflows/android.yml`). This guide walks you through the
one-time manual steps. Take it slow — each step tells you exactly what to click.

**App facts**

- Package ID: `com.ic3nin3.mochimerge`
- Display name: **Mochi Merge**
- CI: GitHub Actions → builds a signed AAB on every push to `main`

---

## 0. Create the signing keystore (one time, ~2 min)

The keystore signs your app forever — **back it up and never commit it**
(`.gitignore` already excludes `*.keystore`). You need a Java JDK (keytool
ships with it). If you don't have Java, install one first, e.g.
`winget install EclipseAdoptium.Temurin.17.JDK`, then open a NEW terminal.

Run this (Git Bash or PowerShell), replacing the passwords with your own
strong ones — or let it generate them interactively:

```bash
mkdir -p ~/mochi-keystore
keytool -genkeypair -v \
  -keystore ~/mochi-keystore/mochi-merge.keystore \
  -alias mochi \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass 'YOUR_STORE_PASSWORD' \
  -keypass 'YOUR_KEY_PASSWORD' \
  -dname "CN=Mochi Merge, OU=Games, O=ic3nin3, C=US"
```

Then produce the base64 for the GitHub secret:

```bash
base64 -w 0 ~/mochi-keystore/mochi-merge.keystore > ~/mochi-keystore/keystore.base64.txt
```

Keep `mochi-merge.keystore`, both passwords, and the alias (`mochi`) somewhere
safe (password manager). Losing the keystore means you can never update the app.

---

## 1. Play Console account (one time, $25)

1. Go to <https://play.google.com/console> and sign in with your Google account.
2. Choose **Personal** account type and pay the **$25 one-time fee**.
   Use a **non-prepaid** credit/debit card (prepaid cards are often rejected).
3. The name on your payment/ID **must match** the developer name you register —
   Google verifies identity for personal accounts.
4. Complete ID verification if prompted (can take a day or two).

## 2. Create the app in Play Console

1. **All apps → Create app**.
2. Name: `Mochi Merge`. Default language: English (US). App or game: **Game**. Free.
3. After creation, go to **App integrity / Signing** — choose
   **Google Play App Signing** (recommended; Google keeps the app-signing key,
   your upload key is the keystore from step 0).
4. The package name is fixed to `com.ic3nin3.mochimerge` by the first AAB you
   upload — it can never change afterwards.

## 3. GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | contents of `keystore.base64.txt` (step 0) |
| `KEYSTORE_PASSWORD` | your store password |
| `KEY_ALIAS` | `mochi` |
| `KEY_PASSWORD` | your key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | full JSON from step 4 below (add later) |

## 4. Google Cloud service account (for CI uploads)

1. Go to <https://console.cloud.google.com> → create a project (any name).
2. **APIs & Services → Library** → enable **Google Play Android Developer API**.
3. **IAM & Admin → Service Accounts → Create** (name e.g. `play-ci`).
4. Open the service account → **Keys → Add key → JSON** → download the file.
5. Back in **Play Console → Users and permissions → Invite user**: add the
   service account's email, grant **Release manager** (or Admin) permission
   to the Mochi Merge app.
6. Paste the whole JSON file contents into the `PLAY_SERVICE_ACCOUNT_JSON`
   GitHub secret. The CI upload step auto-enables once this secret exists.

## 5. First upload — do it manually once

Play's API **cannot create the very first release** of a brand-new app. So:

1. Push to `main` → GitHub Actions builds `app-release.aab` → download it from
   the workflow's **Artifacts**.
2. Play Console → **Testing → Internal testing → Create new release** →
   upload the AAB manually, fill release notes, save.
3. From then on, CI uploads to the internal track automatically on every push.

## 6. Test on a real phone (internal track)

1. Internal testing → **Testers** tab → create an email list (your Gmail).
2. Copy the **opt-in link**, open it on your phone, accept, install from Play.
3. Play the game: check all 4 modes, sounds, revive flow, leaderboards.

## 7. Closed track + the 12-testers rule (for production access)

New personal developer accounts must run a **closed test with at least
12 testers opted in for the last 14 consecutive days** before applying for
production access.

- Play Console → **Testing → Closed testing** → create track, add testers.
- Free recruitment tips: friends & family, classmates/coworkers, and the
  subreddit **r/AndroidClosedTesting** (test-for-test community).
- **Recruit 14–15 testers**, not exactly 12 — people drop out or forget to
  stay opted in, and falling below 12 resets your 14-day clock.
- Ask testers to open the app once or twice during the window (engagement
  helps) and to keep the opt-in active the full 14 days.

## 8. Promote to production

1. After 14 days with ≥12 testers: Play Console → **Production access** →
   apply (short questionnaire about your app/loop).
2. Once approved: **Production → Create release** → promote the tested build.
3. Fill the remaining store listing: screenshots (capture from your phone),
   feature graphic (1024×500), short/full description, content rating
   questionnaire, data-safety form (see privacy note below), and the
   **privacy policy URL** (appendix below).

## 9. Everyday updates after launch

```
edit code → git push origin main → CI builds + signs AAB
          → auto-uploads to internal track → promote in Play Console
```

Bump `versionCode`/`versionName` in `android/app/build.gradle` before each
release (Play rejects duplicate version codes).

---

## Privacy policy (required by Play)

Play requires a privacy policy URL even for offline games. Host the template
below free on **GitHub Pages**: create a repo `ic3nin3.github.io` (or a
`docs/` folder + Pages in this repo), paste this as `privacy.html`, and use
that URL in the Play listing and the Data Safety form ("No data collected").

### Appendix: minimal privacy policy template

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Mochi Merge — Privacy Policy</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui;max-width:640px;margin:2rem auto;padding:0 1rem">
<h1>Mochi Merge — Privacy Policy</h1>
<p><em>Last updated: [DATE]</em></p>
<p>Mochi Merge ("the game") is developed by ic3nin3 ("we").</p>
<h2>Data we collect</h2>
<p><strong>None.</strong> The game runs entirely on your device. High scores,
leaderboard names, and settings are stored locally on your device only and
are never transmitted to us or anyone else.</p>
<h2>Ads &amp; purchases</h2>
<p>The game currently contains no real advertising and no real in-app
purchases; any "ad" or "purchase" UI is a local demo. If this changes, this
policy will be updated before release.</p>
<h2>Children</h2>
<p>The game does not knowingly collect any personal information from anyone,
including children under 13.</p>
<h2>Contact</h2>
<p>Questions? Open an issue at github.com/ic3nin3/mochi-merge.</p>
</body></html>
```
