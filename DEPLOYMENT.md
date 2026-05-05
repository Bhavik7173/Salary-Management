# 🚀 Free Deployment Guide — MUL Salary Tracker

Deploy your full-stack app on free tiers:
- **Frontend (React)** → Vercel
- **Backend (FastAPI)** → Render
- **Database (MongoDB)** → MongoDB Atlas (cloud) — viewable via MongoDB Compass

> ⚠️ **Free-tier limits to know up front**
> - Render free backend **sleeps after 15 min idle** → first request takes ~30-60s to wake up.
> - MongoDB Atlas free tier = **512 MB storage** (more than enough for thousands of salary entries).
> - Vercel free = 100 GB bandwidth/month.

---

## ✅ Prerequisites Checklist

- [ ] GitHub account
- [ ] MongoDB Atlas account → https://www.mongodb.com/cloud/atlas/register
- [ ] Render account → https://render.com (sign in with GitHub)
- [ ] Vercel account → https://vercel.com (sign in with GitHub)

---

## STEP 1 — Push Your Code to GitHub

1. In Emergent, click the **"Save to GitHub"** button (top of chat input area).
2. Choose/create a repository name (e.g., `mul-salary-tracker`).
3. Confirm the push. Verify on GitHub that you see `backend/`, `frontend/`, and the new config files.

---

## STEP 2 — Set Up MongoDB Atlas (Database)

### 2.1 Create a free cluster
1. Log in to https://cloud.mongodb.com.
2. Click **"Build a Database"** → choose **"M0 FREE"** tier.
3. Pick any provider/region close to you (e.g., AWS / N. Virginia).
4. Cluster name: `salary-tracker` → click **Create**.

### 2.2 Create a database user
1. Sidebar → **Database Access** → **"Add New Database User"**.
2. Auth method: **Password**.
3. Username: `salary_admin` | Password: click **"Autogenerate Secure Password"** → **COPY & SAVE IT**.
4. Database User Privileges: **"Read and write to any database"** → **Add User**.

### 2.3 Allow network access
1. Sidebar → **Network Access** → **"Add IP Address"**.
2. Click **"Allow Access from Anywhere"** (`0.0.0.0/0`) → **Confirm**.
   *(Required because Render's free IPs change. Your DB is still protected by username/password.)*

### 2.4 Get your connection string
1. Sidebar → **Database** → click **"Connect"** on your cluster.
2. Choose **"Drivers"** → Driver: **Python**, Version: **3.12 or later**.
3. Copy the connection string. It looks like:
   ```
   mongodb+srv://salary_admin:<password>@salary-tracker.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. Replace `<password>` with the password you saved in step 2.2.
5. **Save this string somewhere safe** — you'll paste it into Render in Step 3.

### 2.5 (Optional) Connect with MongoDB Compass
- Download Compass: https://www.mongodb.com/try/download/compass
- Paste the same connection string → you can now view/edit your data via GUI.

---

## STEP 3 — Deploy Backend on Render

### 3.1 Create a new Web Service
1. Log in to https://dashboard.render.com.
2. Click **"New +"** → **"Web Service"**.
3. Click **"Connect account"** → authorize GitHub → select your repo.
4. Configure the service:
   - **Name:** `mul-salary-tracker-api`
   - **Region:** Oregon (or closest to you)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** **Free**

### 3.2 Add Environment Variables
Scroll to **"Environment Variables"** → click **"Add Environment Variable"** for each:

| Key | Value |
|---|---|
| `MONGO_URL` | *(paste your Atlas connection string from Step 2.4)* |
| `DB_NAME` | `salary_tracker` |
| `CORS_ORIGINS` | `*` *(we'll tighten this in Step 5)* |
| `PYTHON_VERSION` | `3.11.9` |

### 3.3 Deploy
1. Click **"Create Web Service"**.
2. Wait 3–6 minutes for the first build. Watch logs for `Uvicorn running on...`.
3. Once live, copy your backend URL — it looks like:
   ```
   https://mul-salary-tracker-api.onrender.com
   ```
4. Test it in browser: visit `https://YOUR-BACKEND-URL.onrender.com/api/` — you should get a JSON response (not a 404).

---

## STEP 4 — Deploy Frontend on Vercel

### 4.1 Import the project
1. Log in to https://vercel.com/dashboard.
2. Click **"Add New..."** → **"Project"**.
3. **Import Git Repository** → select your repo.
4. Configure:
   - **Framework Preset:** `Create React App` (auto-detected)
   - **Root Directory:** click **"Edit"** → set to `frontend`
   - **Build Command:** `yarn build` (auto-filled)
   - **Output Directory:** `build` (auto-filled)
   - **Install Command:** `yarn install` (auto-filled)

### 4.2 Add Environment Variable
Expand **"Environment Variables"** and add:

| Key | Value |
|---|---|
| `REACT_APP_BACKEND_URL` | `https://mul-salary-tracker-api.onrender.com` *(your Render URL from Step 3.3, no trailing slash)* |

### 4.3 Deploy
1. Click **"Deploy"**.
2. Wait 1–3 minutes for the build.
3. You'll get a URL like `https://mul-salary-tracker.vercel.app`.
4. Open it — your app is live! 🎉

---

## STEP 5 — Tighten CORS (Recommended)

Right now `CORS_ORIGINS=*` allows any website to call your API. Lock it to your Vercel domain:

1. Go to Render dashboard → your backend service → **Environment** tab.
2. Edit `CORS_ORIGINS`:
   ```
   https://mul-salary-tracker.vercel.app,https://mul-salary-tracker-*.vercel.app
   ```
   *(The second pattern allows Vercel's preview deployments.)*
3. Click **"Save Changes"** → Render auto-redeploys.

---

## STEP 6 — Keep Backend Awake (Optional)

Free Render backends sleep after 15 min idle. To keep it warm:

**Option A — UptimeRobot (free, easiest)**
1. Sign up: https://uptimerobot.com (free).
2. Add **New Monitor** → Type: **HTTP(s)** → URL: `https://YOUR-BACKEND-URL.onrender.com/api/` → Interval: **5 minutes**.
3. Done — your backend now stays awake 24/7.

**Option B — Accept the cold start**
- Just live with the ~30-60s wake-up delay on first request after idle.

---

## 🔧 Troubleshooting

**Frontend shows "Network Error" / API calls fail**
- Check `REACT_APP_BACKEND_URL` in Vercel matches your Render URL exactly (no trailing slash, no typos).
- After changing env vars in Vercel, you must **redeploy**: Vercel dashboard → Deployments → ⋯ → Redeploy.

**Backend deploy fails on Render with "ModuleNotFoundError"**
- Verify all packages are in `backend/requirements.txt`.
- Check Render build logs for the exact missing module.

**MongoDB connection fails (`ServerSelectionTimeoutError`)**
- Verify Atlas Network Access includes `0.0.0.0/0`.
- Verify password in `MONGO_URL` is correct (no `<>` brackets, special chars URL-encoded).
- Special chars in password: `@` → `%40`, `#` → `%23`, `:` → `%3A`, `/` → `%2F`.

**CORS errors in browser console**
- Add your exact Vercel URL to `CORS_ORIGINS` on Render.
- Make sure there are no spaces around commas.

**Backend takes 30-60s on first request**
- Normal on Render free tier (cold start). Use UptimeRobot (Step 6) to avoid this.

**Build fails on Vercel with "yarn.lock conflict"**
- Vercel sometimes prefers `npm`. Either delete `package-lock.json` (if present) or set Install Command to `yarn install --frozen-lockfile`.

---

## 📊 Cost Summary

| Service | Free Tier | Upgrade Trigger |
|---|---|---|
| Vercel | 100 GB bandwidth/mo | Heavy traffic (>100GB) |
| Render | 750 hrs/mo, sleeps idle | Need always-on / faster |
| MongoDB Atlas | 512 MB storage | DB grows beyond 512 MB |

For a salary tracker, you can comfortably stay free forever unless you build massive traffic.

---

## 🎯 Next Steps After Going Live

1. **Custom domain** (optional): both Vercel and Render let you add a custom domain free.
2. **Backups**: MongoDB Atlas free tier doesn't include automated backups. Use the **Export to PDF/Excel** features in your app, or upgrade to M10 ($57/mo).
3. **Monitoring**: UptimeRobot also alerts you via email if your app goes down.

---

Need help? Re-open the Emergent chat and paste any error messages — I'll help debug.
