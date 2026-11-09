# صفحات — تطبيق iOS و Android

قارئ ومحرر PDF عربي، يُبنى تلقائياً على GitHub للنظامين بأداة Capacitor.

## ما في المشروع

| الملف | عمله |
|---|---|
| `src/safahat.html` | التطبيق نفسه (نفس نسخة الويب) |
| `src/native-shim.js` | ربط التطبيق بالجهاز: الحفظ في «الملفات» والمشاركة، فتح ملفات PDF من التطبيقات الأخرى، المساعد الذكي بمفتاحك |
| `scripts/build-www.mjs` | يجمع التطبيق مع كل المكتبات والخطوط الأساسية داخله ليعمل دون إنترنت |
| `scripts/patch-native.mjs` | يضيف صلاحيات الكاميرا والصور، و«فتح بواسطة صفحات»، والاسم العربي، ورقم الإصدار |
| `assets/logo.png` | الأيقونة (تُولَّد منها كل المقاسات تلقائياً) |
| `.github/workflows/android.yml` | يبني تطبيق أندرويد |
| `.github/workflows/ios.yml` | يبني تطبيق آيفون وآيباد |

## الخطوات

1. أنشئ مستودعاً **خاصاً** (Private) على GitHub وارفع إليه كل الملفات، **ومنها مجلد `.github`**.
2. افتح تبويب **Actions** في المستودع: يبدأ البناء تلقائياً مع كل رفع، أو اضغط **Run workflow**.
3. عند انتهاء البناء (١٠–٢٠ دقيقة) افتح التشغيلة وحمّل الملفات من قسم **Artifacts**.

## أندرويد

- `safahat-android-debug-…` فيه **app-debug.apk**: انقله إلى الجوال وافتحه، واسمح بالتثبيت من مصادر غير معروفة. يعمل مباشرة دون أي حساب.
- للنشر في Google Play تحتاج نسخة موقّعة. أنشئ مفتاح التوقيع مرة واحدة واحتفظ به للأبد:
  ```
  keytool -genkeypair -v -keystore release.jks -alias safahat -keyalg RSA -keysize 2048 -validity 10000
  base64 -i release.jks | pbcopy        # على الماك (أو: base64 -w0 release.jks على لينكس)
  ```
  ثم في المستودع: **Settings › Secrets and variables › Actions** أضف:
  `ANDROID_KEYSTORE_BASE64` و `ANDROID_KEYSTORE_PASSWORD` و `ANDROID_KEY_ALIAS` (safahat) و `ANDROID_KEY_PASSWORD`.
  بعدها يخرج ملف **.aab** جاهز للرفع إلى Google Play Console.

## آيفون وآيباد

كل بناء يُخرج دون أي حساب:
- **Safahat-unsigned.ipa**: نسخة غير موقّعة. تثبّتها على جهازك بأداة مثل Sideloadly أو AltStore بحساب Apple ID المجاني (تحتاج إعادة توقيع كل ٧ أيام).
- **Safahat-simulator.zip**: يفتح في محاكي Xcode على أي ماك.

للتثبيت الدائم وTestFlight والنشر في App Store تحتاج **Apple Developer Program** (٩٩ دولاراً سنوياً)، ثم:
1. في developer.apple.com أنشئ **App ID** بالمعرّف `com.hameedalajja.safahat` (أو غيّره في `capacitor.config.json`).
2. أنشئ شهادة **Apple Distribution** وصدّرها ملف ‎.p12 بكلمة مرور.
3. أنشئ **Provisioning Profile** من نوع App Store (أو Ad Hoc لأجهزتك فقط).
4. أضف في Secrets:
   - `IOS_CERT_P12_BASE64` و `IOS_CERT_PASSWORD` و `IOS_PROFILE_BASE64`
   - وللرفع التلقائي إلى TestFlight: مفتاح App Store Connect API: `ASC_KEY_ID` و `ASC_ISSUER_ID` و `ASC_KEY_P8_BASE64`.
   
   (لتحويل أي ملف إلى base64: `base64 -i file | pbcopy` على الماك.)

عند وجود هذه الأسرار يخرج أيضاً **Safahat.ipa** موقّعاً، ويُرفع إلى TestFlight تلقائياً إن وُجد مفتاح API.

## المساعد الذكي في التطبيق

داخل Claude يعمل المساعد بحسابك. في التطبيق المستقل افتح قسم **المساعد الذكي** وأدخل مفتاح Claude API من console.anthropic.com. يُحفظ المفتاح على جهازك فقط ويُرسل مباشرة إلى Anthropic، والتكلفة حسب الاستخدام. لا تضع مفتاحك داخل الكود ولا تشارك نسخة فيها مفتاحك.

## ملاحظات

- الملفات المحفوظة والمصدّرة تظهر في تطبيق «الملفات» داخل مجلد **صفحات**.
- يمكن فتح أي PDF من «الملفات» أو البريد أو واتساب عبر «مشاركة › صفحات».
- قلم Apple: النقر المزدوج يبدّل إلى الممحاة (أو حسب إعدادات الإيباد)، والضغط على Apple Pencil Pro يفتح دائرة الأدوات عند طرف القلم. هذا يعمل في التطبيق المثبّت فقط، لا في المتصفح.
- المزامنة السحابية تعمل في نسخة Claude فقط حالياً؛ في التطبيق استخدم «النسخ الاحتياطي». (مزامنة iCloud مرحلة قادمة.)
- عند النشر في App Store سيسألك عن التشفير: التطبيق يستخدم تشفيراً قياسياً (AES) لحماية ملفات المستخدم فقط.
- لتحديث التطبيق: استبدل `src/safahat.html` بالنسخة الجديدة وارفعها، فيُبنى من جديد.
