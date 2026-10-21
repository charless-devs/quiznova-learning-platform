# QuizNova on Vercel - the guide

Vercel runs the app, but **Vercel has no MySQL**. That is why a fresh
deployment says:

```
The database is not reachable on localhost:3306. Is the MySQL service running?
```

The app reads its database from the environment. Without those variables it
looks for MySQL on the computer - and on Vercel there is no MySQL.

So a deployment is two things: **a hosted MySQL** + **the environment
variables**.

---

## 1. A hosted MySQL (5 minutes, free)

The app speaks MySQL/MariaDB. A free managed MySQL works:

| Provider | What you get |
|---|---|
| **Aiven** (aiven.io) | A free MySQL 8 service, with a hostname, a port, a user, a password and a database |
| **PlanetScale** (planetscale.com) | A free MySQL, but the plan needs a card |
| **Railway / Render** | A MySQL container, a little more setup |

**With Aiven** (the easiest):

1. Create an account, then **Create service → MySQL** (the free plan is
   enough).
2. Open the service → **Connection** → copy the values:
   * **Host** → `DB_HOST` (it looks like `mysql-xxxxx-you-123.f.aivencloud.com`)
   * **Port** → `DB_PORT` (not always 3306 - take the one from the panel)
   * **User** → `DB_USER` (`avnadmin`)
   * **Password** → `DB_PASSWORD`
   * **Database** → `DB_NAME` (`defaultdb`)
3. Keep the values - you need them in the next step.

> **The service needs a minute to be ready.** Right after the creation the
> hostname does not resolve yet (`ENOTFOUND`) - that is normal, wait a
> moment and check again.

> Vercel can not reach `localhost` - the database has to be **publicly
> reachable** (the free plans of Aiven and PlanetScale are). Add the host of
> Vercel to the allow-list of the database if the provider asks for it.

### The encrypted connection

Aiven asks for SSL. The app can do that:

| Variable | Value | What it does |
|---|---|---|
| `DB_SSL` | `1` | the connection is encrypted |
| `DB_SSL_CA` | the path of the CA file | the certificate of the provider is checked (without it the connection is encrypted but the certificate is not verified) |

The CA certificate of Aiven is in the panel of the service (**CA certificate →
Show**). Save it as `db/aiven-ca.pem` and set `DB_SSL_CA=db/aiven-ca.pem`.

## 2. The environment variables of the project

In Vercel: **your project → Settings → Environment Variables**.

| Variable | Value | Type |
|---|---|---|
| `DB_HOST` | the host of the database | plain |
| `DB_PORT` | the port of the database (Aiven uses a random one) | plain |
| `DB_USER` | the user of the database | plain |
| `DB_PASSWORD` | the password of the database | **encrypted** |
| `DB_NAME` | the name of the database | plain |
| `DB_POOL_SIZE` | `3` (a serverless app opens few connections) | plain |
| `DB_SSL` | `1` (the connection is encrypted) | plain |
| `SESSION_SECRET` | a long random string | **encrypted** |
| `BLOB_READ_WRITE_TOKEN` | only if you want to upload video files | **encrypted** |

Generate the secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Encrypted** means the value is stored encrypted and never shown again - use
it for the password and the secret.

## 3. The database needs the schema

The tables do not travel with the code. Create them **once** on the hosted
database - with the same values in a local `.env`:

```bash
# .env (or the environment of the shell)
DB_HOST=...
DB_PORT=3306
DB_USER=...
DB_PASSWORD=...
DB_NAME=...

npm run db:setup     # creates the tables and the demo content
```

`npm run db:setup` is safe to run again - it never overwrites a password.

## 4. The videos

The file system of a serverless function is read only, so an uploaded video
cannot be written to `public/uploads`. Two ways:

* **A link (the easy way)** - the admin adds a YouTube, a Vimeo or a direct
  mp4 link in **Courses & Videos**. Nothing to store, nothing to pay.
* **The Blob store of Vercel** - create a Blob store in the dashboard and put
  its token into `BLOB_READ_WRITE_TOKEN`. The app then uploads the files
  there and plays them from the CDN.

## 5. The deployment

The repository is already linked to GitHub, so every push to `main` is a new
deployment.

```bash
git push origin main
```

or with the CLI:

```bash
npx vercel --prod          # the first time it asks for the login
```

### The commands that were used for this project

```bash
# 1. the login of the CLI
npx vercel login charleslambusonshi@gmail.com

# 2. the connection to the project
npx vercel link --yes --project quiznova-learning-platform

# 3. the secret (encrypted - it can not be read again)
npx vercel env add SESSION_SECRET production --sensitive \
  --value "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" --yes

# 4. the database
npx vercel env add DB_HOST production --value "your-mysql-host" --yes
npx vercel env add DB_PORT production --value 3306 --yes
npx vercel env add DB_USER production --value "your-user" --yes
npx vercel env add DB_PASSWORD production --sensitive --value "your-password" --yes
npx vercel env add DB_NAME production --value "quiznova" --yes
npx vercel env add DB_POOL_SIZE production --value 3 --yes

# 5. the tables on the hosted database (once)
npm run db:setup

# 6. the deployment
npx vercel --prod
```

The list of the variables: `npx vercel env ls`.

## 6. What works and what does not

| | |
|---|---|
| The whole app, the login, the quizzes, the videos with a link | ✅ |
| The uploaded videos | ✅ with the Blob store, otherwise use a link |
| The realtime stream (the green *Live* dot, the answers that arrive live) | ❌ a serverless function cannot hold a connection open - the app switches it off by itself |
| The demo accounts | ⚠️ change the password of the administrator and delete the demo accounts |

## 7. If you do not want a hosted database

A normal server (a VPS with Ubuntu + Nginx + Node + MySQL) runs the app
exactly as it runs on your PC - including the realtime stream and the local
video files. See **DATABASE_SETUP.md** for the database and the app itself.
