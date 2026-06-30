# Bambu Manager

تطبيق Android WebView لتسعير طلبات الطباعة ثلاثية الأبعاد.

## آخر تعديل

تم توحيد معادلة التسعير مع برنامج الديسك توب MOO3D:

- الخامة، الهالك، الماكينة/الإهلاك، الكهرباء، الشغل اليدوي، والتغليف تعتبر إجمالي تكلفة إنتاج الأوردر كله.
- المخاطرة/الفشل والضريبة يتم حسابهم على تكلفة الإنتاج فقط.
- هامش الربح يتم تطبيقه على تكلفة الإنتاج بعد المخاطرة والضريبة.
- الإكسسوارات تكلفة للقطعة الواحدة وتضرب في عدد القطع.
- الشحن يضاف مرة واحدة للأوردر كله ولا يدخل في هامش الربح.
- الخصم يطبق بعد إضافة الربح والإضافات، ثم الحد الأدنى، ثم التقريب لأقرب قيمة محددة.

## GitHub Actions build

The repository includes `.github/workflows/android.yml`.

- Push the files to the `main` branch, or open **Actions** and run **Build Android APK** manually.
- The workflow builds both:
  - `app-debug.apk`
  - `app-release-unsigned.apk`
- Download the APK files from the workflow **Artifacts** section after the run finishes.
