# Liitpos on iPhone and Android

The phone apps are a native shell around the live register at
[https://liitpos.grok.me](https://liitpos.grok.me). They are not a second copy of
the code. Sales, staff, and sign-in stay on the website you already deploy.

The shell is [Capacitor](https://capacitorjs.com/) 8. Android and iOS projects
live in `android/` and `ios/`.

## Why the app opens the website

Liitpos is a server app. Sign-in, the database, and sync all run on the
deployed site. The login cookie is locked to that exact address
(`__Host-` cookie: HTTPS, this host only, not shared with other sites).

A copy of the web build inside the app would be a different address
(`https://localhost` or `capacitor://localhost`). The cookie would not be
sent, and the register's server calls would be rejected. So the installed
app opens `https://liitpos.grok.me` directly. From the phone's point of view
that is the real site, and sign-in works the same way it does in a browser.

Use the public address (`liitpos.grok.me`), not a `*.vercel.app` address.
The login cookie is tied to the public host. Vercel is only where the server
runs behind that host.

## The one file you edit

[`mobile/app.json`](mobile/app.json)

| Field | What it is | Current value |
| --- | --- | --- |
| `appName` | Name under the icon | `Liitpos` |
| `appId` | iOS bundle id and Android application id | `com.liitpos.app` |
| `serverUrl` | Site the app opens | `https://liitpos.grok.me` |
| `allowNavigation` | Sites that may stay inside the app during sign-in | Google, X, and `*.grok.me` |

After any change:

```bash
npm run mobile:sync
```

That rewrites `capacitor.config.json` and copies it into the native projects.
Do this before you build.

`CAPACITOR_SERVER_URL` can point one build at a different https site without
editing the file. Do not commit that temporary value.

```bash
CAPACITOR_SERVER_URL=https://example.com npm run mobile:sync
```

The id `com.liitpos.app` is a proposal. It has to be unique in each store.
Change it before the first upload if you want a different one. After the
first upload, the id is permanent for that store listing. Files that contain
it:

- `mobile/app.json` (edit this, then sync)
- `android/app/build.gradle` (`namespace` and `applicationId`)
- `android/app/src/main/java/com/liitpos/app/MainActivity.java` (the folder must match the package)
- `android/app/src/main/res/values/strings.xml`
- `ios/App/App.xcodeproj/project.pbxproj` (`PRODUCT_BUNDLE_IDENTIFIER`)

Search the repo for `com.liitpos.app` and replace every hit, then run
`npm run mobile:sync`.

## What you need

| Goal | You need |
| --- | --- |
| Website, unchanged | Nothing new. Vercel does not install the mobile tools. |
| Android app on a phone or emulator | A computer with Node.js 22, Android Studio, and a JDK (Android Studio's JDK is enough) |
| Android app on Google Play | A [Google Play Console](https://play.google.com/console) account. One-time registration fee (25 USD). An upload keystore, created once and backed up |
| iPhone app | A Mac with Xcode from the Mac App Store. Apple does not allow iOS builds on Windows or Linux |
| iPhone app on the App Store | An [Apple Developer Program](https://developer.apple.com/programs/) membership (99 USD per year) |

You do not need a Mac to build the Android app. You do need a Mac for iOS.

## First time on your computer

From the project folder:

```bash
npm install
npm run mobile:sync
```

`npm install` (not `npm install --omit=dev`) is required. The Capacitor tools
are development dependencies so the Vercel website install stays the same.

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run mobile:sync` | Copy the site address and plugins into `android/` and `ios/` |
| `npm run mobile:open:android` | Open the Android project in Android Studio |
| `npm run mobile:open:ios` | Open the iOS project in Xcode (Mac only) |
| `npm run mobile:android:debug` | Build a debug APK you can install on a phone |
| `npm run mobile:android:bundle` | Build the `.aab` file you upload to Play |
| `npm run mobile:icons` | Redraw the icon and splash from the register mark |
| `npm run mobile:assets` | Turn those drawings into every Android and iOS size |

The icon is the green mark from `public/favicon.svg`, not the placeholder
images in `public/icon-*.png`.

## Run on Android

1. Install [Android Studio](https://developer.android.com/studio).
2. Open Android Studio and, if it asks, install the current SDK. This project
   compiles against Android SDK 36 (`android/variables.gradle`).
3. In this repo run `npm install` and `npm run mobile:open:android`.
   Or in Android Studio choose **Open** and select the `android` folder
   (the folder itself, not `android/app`).
4. Wait until Gradle finishes. The first sync downloads a lot.
5. Phone: on the phone, turn on Developer options and USB debugging, plug it
   in, and accept the prompt. Emulator: Device Manager, create a phone, start it.
6. Press **Run**. The app icon is Liitpos. It should show a green splash,
   then the register.

A debug APK without Android Studio:

```bash
npm run mobile:android:debug
```

The file is `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to a
phone and open it. The phone may ask you to allow installs from that source.

## Run on iPhone

On a Mac:

1. Install Xcode from the Mac App Store, then open it once and accept the license.
2. In this repo run `npm install` and `npm run mobile:open:ios`.
   Or open `ios/App/App.xcodeproj` in Xcode. The first open downloads the
   Capacitor Swift packages. That needs a network connection. There is no
   CocoaPods step.
3. In the project navigator, select the **App** target, then **Signing & Capabilities**.
4. Check **Automatically manage signing**. Choose your Team. A free Apple ID
   can run on your own phone for a few days. The App Store needs the paid
   Developer Program.
5. Pick a simulator or your plugged-in iPhone, and press **Run**.

If Xcode says the bundle id is not available, someone else already uses
`com.liitpos.app`. Change the id (see above) before you continue.

## Publish on Google Play

Do the internal-test track first. You can install that build yourself before
the public listing.

### 1. Create the upload key once

From the `android` folder:

```bash
keytool -genkeypair -v -keystore liitpos-upload.keystore -alias liitpos -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` comes with a JDK. Android Studio includes one. Use a password you
will not forget. Back up `liitpos-upload.keystore` somewhere that is not git.
If you lose it, you cannot update the Play listing.

Copy the example and fill in the real passwords:

```bash
cp keystore.properties.example keystore.properties
```

`android/keystore.properties` and `*.keystore` are gitignored.

### 2. Build the bundle

From the project folder:

```bash
npm run mobile:android:bundle
```

The file to upload is:

`android/app/build/outputs/bundle/release/app-release.aab`

Play wants an `.aab`, not an APK.

### 3. Play Console

1. Sign in at [play.google.com/console](https://play.google.com/console) and pay the registration fee.
2. **Create app**. Name: Liitpos. App or game: App. Free or paid: your choice.
3. Finish the dashboard tasks Play lists. They change names slightly, but you
   will need:
   - Privacy policy URL (a page on the web that says what the register stores)
   - App access: tell the reviewer the register opens without an account, and
     cloud sign-in is the Google or X button on the login screen
   - Ads: this app does not show ads
   - Content rating questionnaire
   - Target audience
   - Data safety: the app loads your existing website. Sign-in is handled by
     that site (Google and X). Say so. Do not claim the app collects nothing
     if people sign in
   - Store listing: short description, a few phone screenshots, and the 512×512
     icon. You can export screenshots from the emulator
4. **Test and release → Internal testing → Create release**. Upload the `.aab`.
5. Install it from the test link on your own phone. Ring up a sale.
6. When you are happy, promote the release to production.

Each later upload needs a higher **version code**. In
`android/app/build.gradle`, bump `versionCode` by 1 (1, then 2, then 3) and
set `versionName` to the version people see (`1.0`, then `1.1`). The iOS
version is separate: in Xcode, the App target, **General**, **Version** and
**Build**.

## Publish on the App Store

1. Enroll in the Apple Developer Program. Approval can take a day or two.
2. On the Mac, Xcode → Settings → Accounts → add the Apple ID that is on the team.
3. Open `ios/App/App.xcodeproj`. Select the App target. Signing, set the team.
   Bundle id `com.liitpos.app`. Version `1.0`, build `1`.
4. Set the run destination to **Any iOS Device (arm64)**, not a simulator.
5. Menu **Product → Archive**. When it finishes, **Distribute App → App Store Connect → Upload**.
6. In [App Store Connect](https://appstoreconnect.apple.com), create the app
   with the same bundle id. Fill in the listing, screenshots (required sizes
   are listed there), privacy policy URL, and the privacy questionnaire.
   Encryption: the app only uses ordinary HTTPS, and
   `ITSAppUsesNonExemptEncryption` is already false, so you can answer that
   you do not use non-exempt encryption.
7. Add the build to the version, and submit for review.

Review notes that help, in English:

> Liitpos is the register for our shops (the Hebrew name on screen is קופהקל).
> It opens our live site. A reviewer can use the sale screen without an
> account. Cloud admin uses the Google or X button.

Apple sometimes rejects apps that are only a website in a frame (guideline
4.2). This shell is the daily register, with your icon, splash, and the same
accounts as the site. If a review is rejected for that reason, reply that
staff use it as the point of sale and that sales and sign-in have to stay on
the live server. Do not ship a second, separate register.

## Sign-in, cookies, and sales

- The app and the website share one server. A sale uploaded to the cloud from
  the phone is the same sale you see in a browser.
- The login is stored in the app, not in Chrome or Safari. Someone who is
  signed in in the browser still signs in once inside the app.
- Sign-in stays inside the app (Google, X, and `grok.me`). That is required
  so the session cookie is saved in the app. If a login page jumps out to
  Chrome or Safari, add that site's host to `allowNavigation` in
  `mobile/app.json` and run `npm run mobile:sync`.
- Google sometimes refuses sign-in inside an app web view and shows a message
  that you must use a browser. The register on the sale screen still works
  with the staff code. If the Google button hits that block, do not try to
  disguise the app as Chrome. Say so and we can add a proper hand-off. X
  sign-in is a separate button.
- Opening the app needs a network connection, because the screen is the live
  site. If the site cannot be reached, a green Liitpos screen explains that.
  Sales already on the server are safe. This is the same limit as refreshing
  the website while offline.
- The app does not ask for the camera, location, or contacts. It only needs
  the network.

## Updating later

1. Ship the website as usual. Phones pick up the new site the next time the
   app opens. You do not upload a new store build for an ordinary website change.
2. Upload a new store build only when the shell changes: icon, app name, site
   address, plugins, or the version number.
3. For that build, bump the Android version code and the iOS build number,
   then repeat the Play and App Store upload steps.

## What not to commit

- `android/keystore.properties`
- `android/liitpos-upload.keystore` (or any `.keystore` / `.jks`)
- `android/local.properties` (your SDK path)
- Play or Apple passwords

The website build is unchanged. `npm run build` and `npm run typecheck` do
not need Android Studio or Xcode.
