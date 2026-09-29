# Ledger — standalone setup

## 1. Set up the database
1. Go to your Supabase project → **SQL Editor** → New query.
2. Paste the contents of `schema.sql` and click **Run**. It creates the transactions and custom-categories tables, applies per-user Row Level Security policies, and installs the currency-conversion function. It is safe to rerun: policies are replaced and existing transaction rows are preserved.
3. In **Authentication → Providers**, Email is enabled by default — that's all you need.
4. In **Authentication → Settings**, you can turn OFF "Confirm email" while testing, so sign-up works instantly without checking an inbox. Turn it back on before sharing publicly.

## 2. Run it locally (optional, to test first)
Just open `index.html` directly in a browser — it's a single static file, no build step. Sign up with any email/password to test.

## 3. Push to GitHub
```
cd standalone
git init
git add .
git commit -m "Ledger app"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

## 4. Deploy on Cloudflare Pages
1. Go to pages.cloudflare.com → **Create a project** → connect your GitHub repo.
2. Framework preset: **None**. Build command: leave blank. Output directory: `/` (root).
3. Deploy — you'll get a live URL like `yourapp.pages.dev`.

## 5. Custom domain (optional)
In the Pages project → **Custom domains** → add the domain you bought, and follow the DNS instructions shown.

## Notes
- The Supabase URL and publishable key in `index.html` are safe to expose publicly — they're meant to be used client-side. Access to data is protected by the Row Level Security policies in `schema.sql`, not by hiding the key.
- Each signed-up user only ever sees their own transactions, enforced by the database itself.

## Before sharing widely: email delivery
Supabase's built-in email sender is heavily rate-limited (roughly one email per address per minute, plus a low hourly cap for the whole project). For real users, add a custom SMTP provider under **Authentication -> Emails -> SMTP Settings** (Resend, Brevo and similar services have free tiers).

## Backups
The free Supabase tier does not include automatic backups. Users can export their own data from **Profile menu -> Currency & export -> Export CSV**. For your own peace of mind, consider a paid plan with backups once people depend on the app.
