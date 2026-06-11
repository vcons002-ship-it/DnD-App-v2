# deploy/ — host DnD-App-v2 in the cloud (always-on, one stable link, ~$0/mo)

These files turn the app from "runs on your PC behind a random Cloudflare
quick-tunnel URL" into a 24/7 deployment on a **free Google Cloud `e2-micro` VM**
reachable at **one permanent HTTPS link** (e.g. `https://YOURNAME.duckdns.org`).

> **Your local setup is untouched.** Nothing here changes app code or the existing
> run scripts. On your PC, `npm run dev` / `start.bat` still work exactly as before
> (empty `PUBLIC_URL` → random `*.trycloudflare.com` quick tunnel). The cloud lives
> only in the VM's `.env`; the two are independent and can run at the same time.

## Why a VM (not Cloud Run / "serverless")

The app keeps state on disk (`server/data/game.db`, `server/uploads/`) and holds
live WebSocket connections (Socket.IO). Serverless wipes the disk and drops sockets
on scale-to-zero, so it doesn't fit. A small always-on VM does. The stable-link
path already exists in the app via `PUBLIC_URL` — we just point it at our own URL
and skip cloudflared.

## Cost: free, with a $300 safety net

- **GCP Always Free** includes one `e2-micro` (2 shared vCPU, 1 GB RAM, 30 GB disk)
  in `us-central1` / `us-west1` / `us-east1` — **free forever**.
- The **$300 trial credit is 90 days, non-extendable** — don't try to stretch it.
  Use the always-free e2-micro; the $300 is just a buffer. **Before day 90, upgrade
  to a paid billing account** (this is what *keeps* Always-Free; no real charge if
  you stay on the e2-micro in a free region).
- **Egress:** 1 GB/mo free, then **$0.12/GB**. Only map-image *downloads* cost
  egress (uploading/swapping is free; re-shown maps are cached → `304`). Rough rule
  for a 5-person table: ~100 brand-new 2 MB maps per GB (~40 at 5 MB). Even heavy
  use is cents/month. Keep maps ~1–2 MB to stay comfortably under 1 GB. (Optional:
  front the VM with Cloudflare — needs a ~$10/yr domain — to edge-cache maps and
  drop egress to near-zero.)

---

## Step-by-step

### 1. Create the VM (GCP Console)
- Compute Engine → Create instance → machine type **`e2-micro`**, region
  **`us-central1`** (or the closest free region), boot disk **Debian 12, 30 GB
  standard**.
- Check **Allow HTTP** and **Allow HTTPS** traffic.
- After it boots: VPC network → IP addresses → **reserve** the instance's external
  IP as **static** (free while attached to a running VM) so DNS never changes.

### 2. Point a free hostname at it (DuckDNS)
- Sign in at https://www.duckdns.org (Google login), create subdomain `YOURNAME`,
  set its IP to the VM's **static external IP**. (Static IP ⇒ no updater needed.)

### 3. Provision the app (SSH into the VM)
```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/vcons002-ship-it/dnd-app-v2.git
cd dnd-app-v2
git checkout claude/Main          # the stable branch

# Create the cloud .env (NEVER committed — lives only on the VM)
cp .env.example .env
nano .env
#   PORT=4000
#   PUBLIC_URL=https://YOURNAME.duckdns.org
#   CF_TUNNEL_NAME=            (leave blank — disables cloudflared)
#   DM_PASSPHRASE=...          (optional, gates /dm)
#   GEMINI_API_KEY=...         (optional, AI only)

# One-shot provisioner: swapfile + Node 20 + build deps + npm install + build
# + install & start the systemd service.
sudo bash deploy/setup.sh
```

### 4. HTTPS in front (Caddy)
```bash
# Install Caddy (official repo)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

# Use this repo's Caddyfile (edit the hostname first)
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # replace YOURNAME.duckdns.org
sudo systemctl reload caddy        # cert is issued automatically
```

### 5. Done
Open `https://YOURNAME.duckdns.org/dm`, create a session, and share the single
`https://YOURNAME.duckdns.org/join?code=CODE` link. It stays valid across restarts,
reboots, and redeploys.

---

## Day-2 operations
- **Logs:** `journalctl -u dndapp -f`
- **Restart app:** `sudo systemctl restart dndapp`
- **Update to latest code:** `cd ~/dnd-app-v2 && git pull && npm install && npm run build && sudo systemctl restart dndapp`
- **Status:** `systemctl status dndapp caddy`

## Verify (matches the plan's checklist)
1. `systemctl status dndapp` → active; `sudo reboot` → it comes back without manual
   start.
2. `https://YOURNAME.duckdns.org/dm` loads with a valid TLS padlock.
3. Open `…/join?code=CODE` from a phone on cellular → connects, token moves sync
   live (WebSocket through Caddy works).
4. "Copy player link" in the toolbar works (secure-context clipboard).
5. `sudo systemctl restart dndapp` → reopen the same link → session/maps/tokens
   still there (SQLite persisted).
6. **Local untouched:** on your PC, `npm run dev` with empty `PUBLIC_URL` still
   prints a working `*.trycloudflare.com` link.
