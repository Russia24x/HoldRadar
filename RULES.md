# RULES.md — قوانین اجباری کار روی ریپازیتوری HoldRadar

این فایل منبع حقیقت برای قوانین گردش کار (Workflow) است.
هر عامل کدنویس (انسان یا AI) **قبل از هر تغییری** باید این قوانین را بخواند و رعایت کند.

---

## قانون ۱ — NEVER-FORCE-PUSH

- `git push --force` و `git push -f` و هرگونه force push **مطلقاً ممنوع** است.
- اگر push عادی با خطای `non-fast-forward` یا `rejected` مواجه شد:
  1. **STOP فوری** — هیچ تلاش دیگری برای push نکن.
  2. وضعیت را دقیق گزارش بده: `git fetch` → `git status` → `git log --oneline --graph --all -20`.
  3. **منتظر تصمیم صریح مالک ریپازیتوری بمان.** هیچ ادغام (merge)، rebase یا reset مخفی انجام نده.

---

## قانون ۲ — SESSION-START-SYNC-CHECK

در **ابتدای هر session** و **بعد از هر gap زمانی** (مثلاً بعد از هر پیام جدید طولانی
یا وقفه در کار)، قبل از نوشتن هر خط کد جدید:

- a) `git fetch origin`
- b) `git status` و مقایسه local با remote:
  - اگر local **behind** یا **diverged** از `origin/main` بود → **STOP فوری** و گزارش کامل.
  - اگر **clean / identical / up-to-date** (یا remote خالی و local پیشرو) بود → ✅ ادامه کار.
- c) نتیجهٔ بررسی را قبل از ادامه، به‌صورت خلاصه گزارش کن.

---

## قوانین تکمیلی

- **Commit سریع و خرد:** هر کار منطقی تمام‌شده، بلافاصله commit شود (پیام‌های واضح و انگلیسی، با prefix نوع کار: `feat:`, `fix:`, `docs:`, `chore:`).
- **Push بعد از هر commit موفق** انجام شود؛ اگر rejected شد، قانون ۱ اجرا می‌شود.
- **هیچ Secret/کلید خصوصی/توکن در کد commit نمی‌شود.** همهٔ Secretها فقط در محیط اجرا (Environment Variables / Wrangler Secrets) می‌مانند.
- **هیچ force-merge یا بازنویسی تاریخ (history rewrite) انجام نمی‌شود.**
