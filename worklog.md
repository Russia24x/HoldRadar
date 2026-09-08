# HoldRadar — Worklog

> سند ادامهٔ کار پروژه. هر عامل قبل از شروع باید این فایل را بخواند و در پایان بخش خود را اضافه کند.

---

## وضعیت کلی پروژه (به‌روزرسانی: ۲۰۲۶-۰۹-۰۸)

HoldRadar در محیط Next.js 16 (سندباکس Z.ai، پورت ۳۰۰۰، Prisma/SQLite) ساخته شد — معادل کامل بریف «Worker تک‌فایلی» اما با API routes به‌جای Worker و SQLite/Prisma به‌جای KV. همهٔ داده‌ها زنده و واقعی‌اند (CoinGecko + DefiLlama + RPCهای عمومی Abstract و Solana).

### بخش‌های تکمیل‌شده

- **Sync check اولیه**: remote GitHub خالی بود → `origin/main` با push عادی ساخته شد (بدون force). `RULES.md` با دو قانون NEVER-FORCE-PUSH و SESSION-START-SYNC-CHECK کامیت شد (commit `20e0ae4`).
- **دیتابیس (Prisma/SQLite)**: مدل‌های `RankingSnapshot` (معادل kv:rankings:latest)، `UsedPayment` (معادل kv:used-payments — جلوگیری replay)، `SessionRecord`، `DataFetchLog`، `OwnerChallenge`.
- **Pipeline روزانه** (`src/lib/pipeline.ts`): ۳۰۰ نامزد برتر CoinGecko (۲ صفحه، dedup بر اساس id، رفع باگ page semantics) + join با DefiLlama از طریق `gecko_id` (درست مثل بریف §۵.۱) + TVL زنجیره از `/chains` برای L1ها (سولانا/آوالانچ/TRX) + اسنپ‌شات روزانه با روند TVL نسبت به دیروز.
- **موتور امتیازدهی** (`src/lib/scoring.ts`): ۵ زیرمعیار مطابق بریف §۵.۳ با نرمال‌سازی Min-Max و winsorize. **تصمیم مهندسی مهم**: به‌جای بازتوزیع وزنِ دادهٔ ناموجود (که رتبه‌بندی را وارونه می‌کرد — BTC/استیبل‌ها بالا می‌رفتند)، معیارِ بدون داده «صفر» می‌گیرد و وزنش حفظ می‌شود؛ در روش‌شناسی به‌صورت شفاف توضیح داده شده.
- **API routes**:
  - `GET /api/status` — متادیتای عمومی + قیمت لحظه‌ای دارایی‌ها (بدون هیچ ردیف رتبه‌بندی)
  - `POST /api/unlock` — استایل x402: بدون txHash → 402 + requirements؛ با txHash → راستی‌آزمایی آنچین (سولانا با getTransaction/balance-delta، Abstract با eth_getTransactionByHash + دکود Transfer ERC-20) + dedup + صدور کوکی HttpOnly نشست HMAC ۲۴ ساعته + rate limit
  - `GET /api/rankings` — فقط با نشست معتبر (۴۰۱ در غیر این صورت)
  - `POST /api/owner/challenge` + `/api/owner/verify` — ورود مالک با امضای پیام (EIP-191 recover با noble/secp256k1 + ed25519 سولانا)؛ فقط آدرس‌های خزانه پذیرفته می‌شوند
  - `POST /api/refresh` — اجرای دستی pipeline (با کلید QA یا نشست مالک)
- **آدرس‌های تأییدشدهٔ زنده**: خزانه Abstract `0x60Df...8818`، خزانه سولانا `4WN59...oqrr`، USDC.e روی Abstract `0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1` (تأیید آنچین با eth_call: symbol=USDC.e، decimals=6)، PENGU SPL `2zMM...uauv`، USDC سولانا `EPjF...Dt1v`. RPCهای کارکن: `api.mainnet.abs.xyz` + `abstract.drpc.org` + `api.mainnet-beta.solana.com`.
- **فرانت‌اند فارسی RTL تیره پرمیوم**: صفحهٔ قفل (hero + رادار انیمیشنی + کارت $1) → دیالوگ پرداخت ۳ مرحله‌ای (زنجیره/دارایی/پرداخت با QR سولانا‌پی، کپی آدرس، ارسال از کیف‌پول EVM مرورگر با سوئیچ چین 2741، فرم هش تراکنش) → نمای رتبه‌بندی (سه کارت برتر با مدال، جدول با زیرنمره‌ها، expand ردیف با دادهٔ خام، جست‌وجو، مرتب‌سازی، بنر پوشش صادقانه) → دیالوگ روش‌شناسی (فرمول + وزن + پوشش + منابع) → دیالوگ مالک (چالش nonce یک‌بارمصرف + امضا با کیف‌پول یا دستی). فونت Vazirmatn، بدون رنگ آبی/ایندیگو (emerald + amber).

### تست‌های انجام‌شده (QA با agent-browser)

- رندر صفحهٔ قفل ✅ (VLM: طراحی حرفه‌ای)
- دیالوگ پرداخت: انتخاب زنجیره/دارایی، قیمت زنده PENGU ($0.0084)، مبلغ دقیق 120.0587 PENGU، QR سولانا‌پی ✅
- هش نامعتبر → خطای صادقانه ✅
- unlock با QA token (فقط dev) → نشست + رندر رتبه‌بندی با دادهٔ واقعی (Canton 92.2، Convex 75، TRON 70.3...) ✅
- expand ردیف + جست‌وجو (lido) + دیالوگ روش‌شناسی ✅
- مالک: چالش صادر شد، امضای نامعتبر رد شد ✅
- **Paywall integrity**: HTML قفل‌شده هیچ term دادهٔ رتبه‌بندی ندارد؛ /api/rankings بدون نشست ۴۰۱ ✅ (تعریف تمام‌شدهگی #۱ بریف)
- موبایل 390px ✅ + فوتر چسبان ✅ (sticky: true)
- lint: پاک ✅ | همه commitها push شدند

### QA/dev tools (مهم برای ادامه)

- `.env.local` (git نیست): `SESSION_SECRET`، `QA_UNLOCK_TOKEN` (برای تست dev/agent-browser؛ **در پروडاکشن باید unset باشد**).
- unlock تستی: `POST /api/unlock {"chain":"solana","asset":"SOL","qaToken":"<token>"}`
- اجرای pipeline: `POST /api/refresh?force=1 -H "x-qa-key: <token>"`

### ریسک‌ها / کارهای باقی‌مانده (اولویت‌دار)

1. **تست پرداخت واقعی mainnet** با پول واقعی ($1) — نیازمند کیف‌پول واقعی کاربر؛ زیرساخت کاملاً آماده است (Definition of Done #۲ بریف فقط با پول واقعی قابل تست است).
2. **تسویهٔ سمت سولانا در بریف نیازمند «کیف‌پول پرداخت‌کنندهٔ کارمزد» بود** — در این معماری، Worker/سرور فقط *تأیید* می‌کند و تسویهٔ واریز مستقیم به خزانه انجام می‌شود؛ یعنی نیازی به کیف‌پول کارمزد نیست (ساده‌تر و ارزان‌تر از بریف). اگر بعداً x402-facilitator واقعی خواسته شد، بستهٔ `@x402/*` اضافه شود.
3. **دیپلوی Cloudflare**: کد فعلی Next.js است؛ برای بریف (تک-Worker) باید به Hono+x402+Static Assets پورت شود، یا همان Next روی Cloudflare Pages/Workers deploy شود. این محیط اجازهٔ deploy نمی‌دهد.
4. ثبت در portal.abs.xyz (Discover) — دستی، API عمومی مستندی وجود ندارد (بریف §۱۰).
5. قیمت نمایشی پرداخت ۱٪ بالاتر از $1 گرفته شده (تا آستانهٔ ۰.۹۸ دلار راحت رد شود).
6. سقف‌های رایگان CoinGecko (100/min): pipeline روزانه فقط ۲ فراخوانی + قیمت‌ها با کش ۶۰ ثانیه — کم‌خطر؛ ولی اگر 429 دیدید، TTL را بیشتر کنید.

---

Task ID: 1
Agent: main (Z.ai Code)
Task: بررسی همگام‌سازی گیت، RULES.md، و ساخت کامل HoldRadar (فرانت+بک+داده زنده+QA)

Work Log:
- git fetch/status: remote خالی بود؛ بدون force، origin/main با commit قوانین ساخته و push شد
- بررسی زندهٔ آدرس‌ها: USDC.e روی Abstract از docs.abs.xyz و تأیید eth_call؛ RPCهای Abstract و Solana تست شدند
- کل معماری و کد نوشته و تست شد (بخش‌های بالا)
- باگ‌های رفع‌شده: import آیکون Chart، فایل coingecko گم‌شده، ناهم‌خوانی HMAC serialize/parse، دوباره‌کاری صفحات CoinGecko، وارونگی رتبه‌بندی با بازتوزیع وزن، TVL زنجیره برای L1ها، dedup، قیمت live در دیالوگ
- QA کامل با agent-browser (۶ سناریو) + VLM (۵ اسکرین‌شات) + curl paywall integrity
- سه commit push شد: `20e0ae4` (RULES) → `3f84f87` (کل اپ) → `32aaac0` (رفع باگ‌ها)

Stage Summary:
- سایت کامل و قابل‌استفاده است؛ داده ۱۰۰٪ زنده؛ paywall سمت سرور تأییدشده
- هر جلسهٔ بعدی: اول sync check (قانون ۲ RULES.md)، بعد ادامه از بخش «ریسک‌ها/کارهای باقی‌مانده»

---

Task ID: r2 (webDevReview round 2)
Agent: webDevReview cron agent (Z.ai Code)
Task: QA کامل + فیچرهای جدید + رفع باگ overflow موبایل

Work Log:
- Sync check: local == origin/main (پاک) → ادامه طبق RULES.md
- QA با agent-browser: رندر رتبه‌بندی، sort dropdown (تست‌نشده از دور قبل → سالم)، expand ردیف، search، موبایل، console بدون خطای runtime
- فیچرهای جدید:
  • RankDelta badge (↑/↓/جدید/ثابت) نسبت به اسنپ‌شات قبل — prevRank/rankChange در scoring + pipeline + API + UI (جدول، پودیوم، جزئیات ردیف «رتبهٔ دیروز»)
  • LiveCountdown زندهٔ نشست (هر ۳۰ ثانیه tick، هشدار کهرنگی <۱ ساعت)
  • Change90Chip رنگی برای تغییر قیمت ۹۰روزه در ستون جدول
  • دکمه «اشتراک‌گذاری»: خلاصهٔ متنی top-25 در کلیپ‌بورد + toast (تست شد ✅)
  • کلید میانبر «/» برای فوکوس جست‌وجو + Esc برای blur
  • chip «مقایسه با: {prevDate}» در نوار متا (prevDate به API اضافه شد)
  • CoinGecko: retry ×3 با backoff نمایی برای 429/5xx
- رفع باگ‌ها:
  • overflow موبایل (397>390) از ستون badge رتبه → «ثابت» فقط sm+ ، gaps فشرده‌تر → 390=390 ✅
  • overflow هدر موبایل (397) → shrink-0/min-w-0/truncate/gap-2 → ✅
- pipeline دوباره اجرا شد (force) → prevDate پر شد، deltas محاسبه شد (۲۳ ثابت/۱ بالا/۱ پایین در top-25 امروز؛ فردا مقایسهٔ واقعی روزانه فعال می‌شود)
- lint پاک، commit `81fdd2d` push شد

Stage Summary:
- همهٔ تست‌های QA سبز؛ ۵ فیچر جدید + ۲ رفع باگ موبایل
- توصیهٔ دور بعد: ۱) بعد از نیمه‌شب UTC یک اجرای pipeline تا deltaهای واقعی روزانه در UI دیده شود ۲) اضافه‌کردن snapshot تاریخچه API (`/api/history`) + نمایش sparkline تغییر امتیاز ۳) تست پرداخت واقعی mainnet با کاربر ۴) export CSV/JSON علاوه بر متن

---

Task ID: r3 (webDevReview round 3)
Agent: webDevReview cron agent (Z.ai Code)
Task: ارزیابی وضعیت + QA کامل + فیچرهای جدید (تاریخچه/sparkline/خروجی) + بهبود استایل + اجرای pipeline نیمه‌شب UTC

Work Log:
- Sync check: local == origin/main (clean) → ادامه طبق RULES.md
- QA پایه با agent-browser: صفحهٔ قفل، unlock با QA token، search/sort/expand، share+toast، موبایل 390px بدون overflow، بدون خطای runtime → وضعیت: پایدار، باگی یافت نشد
- باگ محیطی (نه کد): dev server با OOM کشته شد (next-server RSS=2.2GB، dmesg تأیید). هر پروسهٔ background که از Bash tool اسپان شود در پایان همان دستور reap می‌شود (حتی setsid/nohup) → راه‌حل QA: اجرای سرور+تست‌ها در «یک» دستور batch. supervisor سیستم خودش سرور را دوباره بالا آورد (پایان کار 200 ✓)
- نکتهٔ مهم agent-browser: `cookies set` positional است: `cookies set <name> <value> --url ...` (فرم --name/--value بی‌اثر است!). refs بعد از هر navigation ریست می‌شوند → snapshot → استخراج ref با sed → click
- فیچرهای جدید این دور:
  • `GET /api/history` (session-gated مثل rankings، 401 بدون نشست): ۱۴ اسنپ‌شات آخر + خلاصهٔ روزانه (top-3 + میانگین ۲۵تایی) + سری روند امتیاز/رتبه برای سکه‌های top-25 امروز
  • `Sparkline.tsx`: SVG بدون وابستگی، گرادیان سطح، نقطهٔ آخر با pulse، رنگ emerald/amber طبقت صعود/نزول، responsive mode
  • در RowDetail (بازشدن ردیف): بخش «روند امتیاز کل (N روز)» با sparkline بزرگ + چیپ‌های Δ/کمینه/بیشینه
  • روی کارت‌های پودیوم: sparkline مینی (۹۲×۲۶)
  • `HistoryDialog`: آرشیو روزانه (جدیدترین اول، نشان «امروز»، top-3 هر روز + میانگین) + دکمهٔ «آرشیو» در نوار متا + chip «آرشیو: N روز» (N>1)
  • Export: CSV (BOM UTF-8، هدر فارسی، escape کوتیشن) و JSON (با weights/coverage) — دانلود Blob سمت کلاینت + toast
  • «نبض امروز»: چیپ‌های صعود/نزول/ثابت/ورود جدید از rankChange ها
  • کیبورد: ↑/↓ پیمایش ردیف‌ها (focus+scrollIntoView)، Enter باز/بسته؛ hint با kbd
  • دکمهٔ شناور «بازگشت به بالا» (بعد از 700px اسکرول)
- بهبود استایل: crown+shine sweep روی کارت اول، hr-grad-text (گرادیان emerald) روی امتیاز سه رتبهٔ اول (پودیوم+جدول)، hover کارت‌ها (-translate-y + سایهٔ emerald)، scale آواتار/نشان رتبه در hover، چیپ‌های متا با active:scale-95، focus ring جست‌وجو با سایهٔ نرم، chevron سبز هنگام باز، انیمیشن‌های CSS جدید در globals.css
- pipeline نیمه‌شب UTC: اجرا در 2026-09-08T00:00:49Z (force) → اسنپ‌شات Sep 8 با prevDate=Sep 7؛ days=2، Canton 94.3→92.6، ۲۵ سکه با ۲+ نقطهٔ روند → sparklines و deltaهای واقعی در UI فعال شدند (تست شد: ۳ SVG پودیوم + TREND-SECTION-OK + ARCHIVE-2DAYS-OK)
- QA نهایی همه سبز: PULSE-REAL، KEYNAV-OK (row 0→1، Enter expand/collapse)، CSV/JSON toast، آرشیو ۲ روزه، بدون خطای صفحه؛ VLM: پودیوم ۹/۱۰؛ ادعای «misalignment RTL» در آرشیو false positive بود (منطق LTR روی layout صحیح RTL)
- lint پاک؛ سه commit push شد: `8cd3d4e` (تاریخچه/sparkline/export/استایل) → `3136ba0` (نبض/کیبورد/بازگشت-به-بالا + اسنپ‌شات Sep 8)

Stage Summary:
- دادهٔ دو روزهٔ واقعی + تمام فیچرهای روند فعال و تست‌شده؛ صفر خطای runtime
- ریسک/نکتهٔ محیطی: OOM در sessions طولانی → اگر سرور مردود بود: batch-mode QA (سرور+تست در یک دستور)؛ supervisor خودش recovery می‌کند
- توصیهٔ دور بعد: ۱) ادامهٔ آرشیو روزانه را خودکار نگه دارید (هر session بعد از نیمه‌شب UTC یک force refresh، یا در deploy واقعی Cron Trigger) ۲) تست پرداخت واقعی mainnet با کیف‌پول کاربر (فقط مانع Definition of Done #2) ۳) پورت به Cloudflare Worker تک‌فایلی طبق بریف اگر deploy خواسته شد ۴) اختیاری: sparkline رتبه (نه فقط امتیاز)، مقایسهٔ دو روز انتخابی در آرشیو

---

Task ID: agw-1
Agent: main (Z.ai Code)
Task: خواندن کامل مستندات AGW (docs.abs.xyz/abstract-global-wallet + build.abs.xyz/AGW Reusables) و اصلاح/تکمیل پروژه بر اساس آن‌ها

Work Log:
- Sync check اولیه: divergence ساختگی (commit تکراری push-نشده با محتوای یکسان) → mixed reset به origin/main (6782859) بدون force push؛ کار محلی حفظ شد
- دانلود ۳۵ صفحهٔ markdown خام AGW از docs.abs.xyz (ترفند `.md` مینت‌لیفت) + ۱۱ صفحهٔ build.abs.xyz (AGW Reusables) + ۵ فایل JSON رجیستری shadcn آن‌ها (`/r/<name>.json`)
- مستندات کلیدی خوانده شد: native-integration، AbstractWalletProvider، useAbstractClient/useLoginWithAbstract، sendTransaction/writeContract، FAQ (AGW فقط روی Abstract کار می‌کند)، connect-to-abstract (explorer = abscan.org!)، x402 accepting/making-payments، AGW Reusables (agw-provider/connect-wallet-button/abstract-contracts)
- نصب پکیج‌ها طبق مستندات: @abstract-foundation/agw-react@1.13.0 + agw-client@1.12.3 + wagmi@2.19.5 (طبق peerdeps؛ اول wagmi@3 نصب شد که با docs ناسازگار بود → به v2 برگشت) + viem@2.56.3
- ساخت `src/config/chain.ts` (mainnet `abstract` پیش‌فرض؛ testnet فقط با NEXT_PUBLIC_AGW_CHAIN=testnet)
- ساخت `src/components/agw/AgwProvider.tsx` (NextAbstractWalletProvider با QueryClient مشترک) → wrap در layout.tsx
- ساخت `src/components/agw/AgwPaySection.tsx`: login() مودال میزبانی‌شده AGW → نمایش آدرس/موجودی (useBalance با token برای USDC.e) → sendTransaction برای ETH و writeContract(transfer) برای USDC.e → هش → تأیید خودکار با retry ۳ مرحله‌ای برای TX_NOT_FOUND
- PaymentDialog: AgwPaySection روش اصلی Abstract؛ کیف‌پول EVM تزریقی به روش ثانویه تنزل یافت؛ submit(hashArg?) برای تأیید خودکار
- OwnerDialog: دکمهٔ «اتصال AGW و امضا» (signMessage از AbstractClient) بالای روش‌های قبلی
- سرور: `src/lib/verify/erc1271.ts` — fallback ERC-1271 (isValidSignature با eth_call، هر دو قرارداد hash EIP-191 و raw) برای وقتی خزانهٔ Abstract کیف‌پول قراردادی AGW باشد؛ owner/verify این مسیر را بعد از EIP-191 می‌آزماید
- x402 هم‌ترازی: `accepts[]` با فرمت دقیق x402 (scheme exact/price/network/payTo/asset/description) در بدنهٔ 402 + هدرهای `x-pay: x402` و `x-pay-schemes: exact`
- اصلاح explorer URL: explorer.mainnet.abs.xyz → abscan.org (config.ts + wallets.ts) طبق docs
- اعتبارسنجی متقاطع: آدرس USDC (0x84A71...87e1) در رجیستری رسمی AGW Reusables عیناً تأیید شد
- QA با agent-browser: صفحهٔ قفل بدون خطای console؛ دیالوگ پرداخت → Abstract → ETH/USDC.e → AGW Section با قیمت زنده ($2483.96)؛ **مودال رسمی AGW باز شد** (Welcome to Abstract / Email / Google / Wallet / Passkey)؛ فلوی cross-app-connect به portal.abs.xyz با requester_origin درست هم تست شد؛ OwnerDialog چالش + دکمهٔ AGW؛ موبایل 390px بدون overflow؛ HTML قفل بدون term داده (paywall integrity)؛ rankings بدون نشست 401؛ امضای نامعتبر مالک → ERC-1271 فراخوانی و رد (403)
- lint پاک؛ tsc: خطاهای جدید صفر (خطاهای قدیمی pipeline/history دست‌نخورده)؛ commit+push: b5f3bcd

Stage Summary:
- AGW رسمی و کامل ادغام شد (پرداخت + ورود مالک)؛ x402 فرمت‌پذیر؛ ERC-1271 برای خزانهٔ قراردادی؛ explorer درست
- Crossmint fiat on-ramp مستند بود اما نیاز به حساب/کلید API خارجی دارد → طبق قید «بدون سرویس خارجی» ادغام نشد (در صورت تغییر نظر کاربر قابل افزودن است)
- باقی‌مانده: تست پرداخت واقعی mainnet با کیف‌پول واقعی کاربر (تعریف تمام‌شدگی #۲ بریف)؛ پورت به Cloudflare Worker اگر deploy خواسته شد
