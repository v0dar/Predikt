# Predikt

AI-powered autonomous trading bot for Polymarket prediction markets. Full web dashboard with dual sidebars, real-time data, multi-user auth, backtesting, and institutional-grade infrastructure.

---

## Pre-Deployment Checklist

Work through each section in order. Every item must be done before the bot handles real funds.

---

### 1. Wallet (Polygon Mainnet)

> Generate a **fresh wallet** for the bot. Do not reuse a personal wallet.

| Variable | How to get it |
|---|---|
| `PRIVATE_KEY` | MetaMask → Create Account → three dots → Account Details → Export Private Key. Fund it with at least **1 MATIC** (gas) and your starting **USDC** on Polygon. |
| `POLYMARKET_PROXY_ADDRESS` | Go to [polymarket.com](https://polymarket.com) and connect this new wallet. Polymarket auto-creates a proxy contract. The proxy address appears in your profile — copy it. |
| `POLYMARKET_API_KEY` | polymarket.com → top-right menu → Settings → API Keys → Generate L2 Key. Copy the key shown — it won't be shown again. |

---

### 2. Blockchain RPC

| Variable | Value |
|---|---|
| `RPC_URL` | Free option: `https://polygon-rpc.com` — works but rate-limited. Better: create a free app on [Alchemy](https://alchemy.com) or [Infura](https://infura.io), select Polygon Mainnet, copy the HTTPS endpoint. |
| `CHAIN_ID` | `137` — always, for Polygon Mainnet. |

---

### 3. Supabase

Go to your [Supabase dashboard](https://supabase.com/dashboard) → your project → **Project Settings → API**.

| Variable | Where |
|---|---|
| `SUPABASE_URL` | Project URL (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | `anon` / `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key — server-only, never expose to the browser |

**Before deploying**, run this SQL in Supabase → SQL Editor:

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  role TEXT DEFAULT 'user',
  telegram_id BIGINT UNIQUE,
  telegram_username TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_profile"
  ON user_profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "service_role_all"
  ON user_profiles FOR ALL TO service_role
  USING (true);
```

---

### 4. Telegram

| Variable | How to get it |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Message [@BotFather](https://t.me/botfather) → `/newbot` → follow prompts → copy the token |
| `TELEGRAM_CHAT_ID` | Message [@userinfobot](https://t.me/userinfobot) → it replies with your numeric chat ID |

**Login widget setup** — after creating the bot:

1. Message BotFather → `/mybots` → select your bot → note the username (e.g. `predikt_bot`)
2. In `src/dashboard/public/login.html` and `signup.html`, the widget defaults to `predikt_bot` — change it if your bot has a different username:
   ```html
   <script>window._telegramBotName = 'your_actual_bot_username';</script>
   ```
3. Tell BotFather the domain that's allowed to use the widget:
   BotFather → `/setdomain` → select your bot → enter your domain (e.g. `predikt.yourdomain.com`)

---

### 5. App Config

| Variable | Value |
|---|---|
| `APP_URL` | Your full domain with HTTPS, e.g. `https://predikt.yourdomain.com`. Must match the domain you set in BotFather for Telegram login. |
| `ADMIN_EMAIL` | The email address you will sign up with. This account gets full bot controls in the dashboard. All other users are read-only. |
| `DASHBOARD_PORT` | `3003` |
| `LOG_LEVEL` | `info` for production, `debug` for troubleshooting |

---

### 6. Redis (VPS)

Run the setup script — it installs Node 20, PM2, Redis (localhost-only + AOF persistence), and Nginx:

```bash
chmod +x scripts/setup-vps.sh
sudo bash scripts/setup-vps.sh
```

Then set:
```
REDIS_URL=redis://127.0.0.1:6379
LOCK_TTL_MS=30000
```

---

### 7. Build and Start

```bash
npm install
npm run build
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup   # follow the printed command to enable auto-start on reboot
```

Check it's running:
```bash
pm2 status
pm2 logs predikt --lines 50
```

---

## Last Things to Verify Before Funding

Work through this in order after the bot is running on your VPS.

- [ ] **Dashboard loads** — open your domain in a browser, confirm you reach the login page
- [ ] **Sign up** — create your admin account using the email set in `ADMIN_EMAIL`
- [ ] **Bot controls are visible** — after logging in, the Overview page should show Scan Now, Pause, and Emergency Stop buttons (admin-only)
- [ ] **Right sidebar shows bot state** — Status tab should show a state (BOOTING, READY, etc.) not just dashes
- [ ] **Wallet page shows balances** — USDC and MATIC amounts should match what you funded the wallet with
- [ ] **Settings are correct** — go to Settings and confirm:
  - `MODE` = `demo` to start (change to `live` when ready)
  - `DRY_RUN` = `true` (change to `false` only when going live)
  - `MAX_BET_USD` = start at `1` for your first live trades, scale up gradually
  - `DAILY_LOSS_LIMIT_USD` = set a limit you're comfortable losing in one day
- [ ] **Logs page is streaming** — Logs page should show real entries, not a blank feed
- [ ] **Telegram alerts work** — go to Settings, enable `TELEGRAM_NOTIFICATIONS`, trigger a manual scan, confirm you receive a message in your Telegram chat
- [ ] **USDC approval done** — Wallet page → Approve USDC → approve an amount equal to or slightly above your starting balance (required for the CLOB to place orders on your behalf)

When all boxes are checked and you're ready to trade live:

1. Settings → set `MODE` to `live`
2. Settings → set `DRY_RUN` to `false`
3. Settings → set `MAX_BET_USD` to `1` (scale up only after confirming orders execute correctly)
4. Trigger a manual scan from the Overview page and watch the Logs tab for the first live order attempt
