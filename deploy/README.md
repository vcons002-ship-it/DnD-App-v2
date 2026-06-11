# Put DnD-App-v2 online — full beginner's walkthrough

Goal: run the app on a **free Google Cloud computer** that's always on, so your
players use **one permanent link** (e.g. `https://yourname.duckdns.org`) even when
your own PC is off. No coding needed — you'll mostly copy and paste.

**Time:** ~30–45 minutes, one time. **Cost:** $0/month (details at the bottom).

> 💡 Your normal way of running the app on your PC (`start.bat`) is **not changed
> by any of this** and keeps working. This just adds a cloud copy.

---

## Before you start — what you'll create

1. A **Google Cloud account** (free) → a tiny always-on computer ("VM").
2. A **free web address** from DuckDNS that points at that computer.
3. The **app + a padlock (HTTPS)** installed on the computer.

You will need: a Google account, and a credit/debit card for the Google free
trial (you will **not** be charged — it's just to verify you're a person).

---

## Part 1 — Create the free cloud computer

### 1.1 Sign up for Google Cloud
- Go to **https://cloud.google.com/free** and click **Get started for free**
  (sign in with your Google account).
- Accept the terms, enter your card for verification. You get **$300 free credit**
  and Google will **not** auto-charge you when it runs out.
- You'll land in the Cloud Console: **https://console.cloud.google.com**

### 1.2 Create the computer (VM)
- Open this page directly: **https://console.cloud.google.com/compute/instances**
- If it asks to **enable the Compute Engine API**, click **Enable** and wait a
  minute.
- Click **Create instance** and set:
  - **Name:** `dnd-app`
  - **Region:** `us-central1 (Iowa)`  ← important: must be a free region
  - **Machine configuration:** Series **E2**, Machine type **`e2-micro`**
    (this exact type is the free-forever one)
  - **Boot disk:** click **Change** → **Operating system: Debian**,
    **Version: Debian 12**, **Boot disk type: Standard persistent disk**,
    **Size: 30 GB** → **Select**
  - **Firewall:** tick **Allow HTTP traffic** and **Allow HTTPS traffic**
- Click **Create**. Wait until it shows a green check ✔.

### 1.3 Lock the computer's address so it never changes
- Open: **https://console.cloud.google.com/networking/addresses/list**
- Find the row for `dnd-app`. In its **Type** column, change **Ephemeral** to
  **Static** (give it any name like `dnd-ip` if asked, then **Reserve**).
- **Write down the External IP** shown here (looks like `34.x.x.x`). You'll need it
  next.

---

## Part 2 — Get a free web address (DuckDNS)

- Go to **https://www.duckdns.org** and click **Sign in** (use Google — easiest).
- In the box near the top, type a name you like, e.g. `mytable`, and click
  **add domain**. You now own **`mytable.duckdns.org`**.
- In the **current ip** box for that domain, paste the **External IP** you wrote
  down in step 1.3, then click **update ip**.

✅ Now `mytable.duckdns.org` points at your cloud computer. (Use *your* name
instead of `mytable` everywhere below.)

---

## Part 3 — Install the app on the computer

### 3.1 Open a terminal on the computer
- Go back to **https://console.cloud.google.com/compute/instances**
- On the `dnd-app` row, click the **SSH** button. A black terminal window opens
  **in your browser** — this is you "inside" the cloud computer. You'll paste
  commands here (right-click → Paste, or Ctrl+Shift+V).

### 3.2 Download the app
Paste this (one block) and press Enter:
```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/vcons002-ship-it/dnd-app-v2.git
cd dnd-app-v2
git checkout claude/Main
```

### 3.3 Create the settings file
Paste:
```bash
cp .env.example .env
nano .env
```
A simple text editor opens. Change just these lines (use **your** DuckDNS name):
```
PORT=4000
PUBLIC_URL=https://mytable.duckdns.org
CF_TUNNEL_NAME=
```
Optional extras you can fill in if you want them:
```
DM_PASSPHRASE=some-secret      # asks for a password to open the DM screen
GEMINI_API_KEY=...             # only for the optional AI monster maker
```
Save and exit: press **Ctrl+O**, then **Enter**, then **Ctrl+X**.

### 3.4 Run the one-time installer
Paste:
```bash
sudo bash deploy/setup.sh
```
This installs everything and sets the app to **start automatically and stay
running 24/7**. It takes a few minutes on the small computer — that's normal.
When it finishes it prints the app's status.

---

## Part 4 — Turn on the padlock (HTTPS)

This gives you a secure `https://` link (needed for the "copy link" button to
work). Paste this block (it installs **Caddy**, which handles HTTPS automatically):
```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```
Now point Caddy at the app (replace `mytable` with your name):
```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
```
Change `YOURNAME.duckdns.org` to `mytable.duckdns.org`, then save and exit
(**Ctrl+O**, **Enter**, **Ctrl+X**). Apply it:
```bash
sudo systemctl reload caddy
```
Wait about 30 seconds for the secure certificate to be issued.

---

## Part 5 — Try it 🎉

- Open **`https://mytable.duckdns.org/dm`** in your browser. You should see the DM
  screen with a padlock 🔒 in the address bar.
- Create a session, then share the player link:
  **`https://mytable.duckdns.org/join?code=YOURCODE`**
- This link **never changes** and works even when your PC is off. Players bookmark
  it once.

---

## Keeping it running (rare, easy)

In the SSH terminal:
- **See if it's running:** `systemctl status dndapp`
- **Restart the app:** `sudo systemctl restart dndapp`
- **See live logs:** `journalctl -u dndapp -f`  (press Ctrl+C to stop watching)
- **Update to the newest app version:**
  ```bash
  cd ~/dnd-app-v2 && git pull && npm install && npm run build && sudo systemctl restart dndapp
  ```

### ⚠️ One thing to do within 90 days
Open **https://console.cloud.google.com/billing**, find your account, and click
**Upgrade** / **Activate full account**. This sounds scary but **does not cost
anything** as long as you keep using the little `e2-micro` in a free region — it's
just the switch that keeps the free tier alive after the trial. If you skip it, the
computer gets switched off when the trial ends.

---

## What this costs (the honest version)

- The `e2-micro` computer in `us-central1`/`us-west1`/`us-east1` is **free forever**.
- The only thing that *can* cost money is **outgoing data** (mainly players
  downloading map images): **1 GB/month is free**, then about **$0.12 per extra
  GB**. For a normal group this is **free or a few cents a month**. Your $300 trial
  credit covers any overage for the first 90 days.
- Tip to stay free: keep map image files reasonably small (~1–2 MB each).

---

## If something goes wrong

- **Page won't load / no padlock:** wait 1–2 minutes after Part 4 (the certificate
  takes a moment). Make sure the DuckDNS IP matches the VM's External IP, and that
  you ticked "Allow HTTP/HTTPS" in step 1.2.
- **App not running:** in SSH run `journalctl -u dndapp -e` to see the error, then
  `sudo systemctl restart dndapp`.
- **Forgot your IP:** it's on
  https://console.cloud.google.com/compute/instances next to `dnd-app`.

## Reference files in this folder
- `setup.sh` — the one-time installer you ran in step 3.4.
- `dndapp.service` — the rule that keeps the app running/restarting (installed for
  you by `setup.sh`).
- `Caddyfile` — the HTTPS config you copied in Part 4.
