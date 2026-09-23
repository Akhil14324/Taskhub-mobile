# CI Build Setup — APK, AAB, IPA via GitHub Actions

`.github/workflows/build-mobile.yml` builds everything natively on GitHub runners — **no EAS**:

| Artifact | Runner | How |
|----------|--------|-----|
| `taskhub-apk` | ubuntu | `./gradlew assembleRelease` |
| `taskhub-aab` | ubuntu | `./gradlew bundleRelease` |
| `taskhub-ipa` | macos-15 | `expo prebuild -p ios` (generates `ios/` locally in CI) → `pod install` → fastlane archive + export |

The Android native project (`Taskhub-mobile/android`) is committed to the repo. The iOS
project is generated fresh in CI on every build (`expo prebuild` cannot run on Windows).

## Required GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.

### Android (APK + AAB)

| Secret | How to get it |
|--------|---------------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i upload.keystore` (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.keystore"))`) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore store password |
| `ANDROID_KEY_ALIAS` | key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | key password |

Create the keystore once (keep it safe — the same key must sign every Play Store upload):

```bash
keytool -genkeypair -v -keystore upload.keystore -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

If these secrets are missing the build still runs but signs with the **debug key** — fine
for testing the APK, not for Play Store upload.

### iOS (IPA) — Apple Developer Program required ($99/yr)

| Secret | How to get it |
|--------|---------------|
| `APPLE_TEAM_ID` | 10-char Team ID — developer.apple.com → Membership details |
| `IOS_DIST_CERT_P12_BASE64` | Export "Apple Distribution" cert + private key from Keychain Access as `.p12`, then base64 it |
| `IOS_DIST_CERT_PASSWORD` | password used when exporting the `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | base64 of an **App Store** provisioning profile for `com.vgrand.taskhub` |

Create the profile at developer.apple.com → Profiles → App Store distribution, tied to the
App ID `com.vgrand.taskhub` with **Push Notifications** capability enabled.

### Optional — TestFlight upload

The IPA uploads to TestFlight automatically by default (untick "Upload the IPA to
TestFlight" in the workflow inputs to disable). These secrets are required when it's on:

| Secret | How to get it |
|--------|---------------|
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect → Users and Access → Integrations → App Store Connect API |
| `APP_STORE_CONNECT_ISSUER_ID` | same page |
| `APP_STORE_CONNECT_API_KEY_P8` | raw contents of `AuthKey_XXXX.p8` — paste the whole block including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` |

## Running it

GitHub → **Actions → Build Mobile Apps → Run workflow** → pick platform (`all` / `android`
/ `ios`). Artifacts (`taskhub-apk`, `taskhub-aab`, `taskhub-ipa`) appear on the run summary
page. `build_number` defaults to the run number and sets both `versionCode` and
`CFBundleVersion`.

## Notes

- First TestFlight/App Store upload requires the app to already exist in App Store Connect
  (create it with bundle ID `com.vgrand.taskhub`).
- If the generated Xcode scheme isn't `TaskHub`, update `scheme:`/`targets:` in
  `Taskhub-mobile/fastlane/Fastfile`.
