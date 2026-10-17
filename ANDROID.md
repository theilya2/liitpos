# Liitpos on Android

Liitpos on a phone is the same register, saved inside the app. It sells, edits products, prints, and writes reports with no internet. When the phone can reach the server and the register is linked to an account, queued changes upload on their own.

The first install is a file you copy onto the phone (an APK). Google Play can wait.

## What you need

- A computer with Node.js 22.
- [Android Studio](https://developer.android.com/studio) (includes the Android SDK). You only need it to open the project or to use an emulator. The command below can build the APK without clicking through Studio.
- The signing key that belongs to this app. It is **not** in git. If you lose it, phones that already have Liitpos cannot install a newer build over the old one. Sales stored on those phones stay only on those phones.
- For cloud sync: the public address of the website (the Vercel URL). This repository does not contain that address. You type it once in the app, under settings, or on the lock screen.

## Application id

The id is `com.liitpos.app`. It is set in `capacitor.config.ts` (`appId`) and, after a sync, in `android/app/build.gradle` (`applicationId` and `namespace`).

Change it only before anyone installs the app. After the first install, a different id is a different app and will not keep the old data.

## Build an APK on your computer

From the project folder:

```bash
npm install
npm run android:release
```

`npm run android:release` builds the register into `mobile/www`, copies it into the Android project, and creates:

`android/app/build/outputs/apk/release/app-release.apk`

That file is what you copy to a phone.

The release build is signed only when these are set in the environment (the GitHub workflow sets them from secrets):

| Variable | Meaning |
| --- | --- |
| `LIITPOS_KEYSTORE` | Path to the `.keystore` file |
| `LIITPOS_KEYSTORE_PASSWORD` | Password for that file |
| `LIITPOS_KEY_ALIAS` | Key name (`liitpos` for the key created with this project) |
| `LIITPOS_KEY_PASSWORD` | Password for that key |

Example:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export LIITPOS_KEYSTORE="$HOME/liitpos-release.keystore"
export LIITPOS_KEYSTORE_PASSWORD="the password you saved"
export LIITPOS_KEY_ALIAS="liitpos"
export LIITPOS_KEY_PASSWORD="the password you saved"
npm run android:release
```

`npm run android:debug` builds a debug APK instead. A debug APK is signed with a temporary debug key. Do not use it on phones that already have the release app. Android will refuse the install because the keys differ.

`npm run android:open` opens the project in Android Studio.

## Install on a phone

1. Copy `app-release.apk` onto the phone (cable, Drive, or any file share).
2. On the phone, open the file.
3. If Android asks, allow this source to install unknown apps (Settings → Apps → Special app access → Install unknown apps, then allow the Files or Chrome app you used to open the APK).
4. Confirm install. The name on the home screen is **Liitpos**.
5. Open it. The register is already inside the app. Turn on airplane mode and sell something to see that it does not need the network.

Updating later uses the same steps. Android replaces the app when the new APK is signed with the **same key**, has the **same id** `com.liitpos.app`, and has a **higher version number**. Receipts and products already stored on the phone stay.

## Connect the cloud

The site address is not stored in the repo. On the phone:

1. Open Liitpos and stay on the lock screen, or sign in with a manager PIN and open settings.
2. Under **ענן**, type the website address, for example `https://your-app.vercel.app`, and save it.
3. Tap **חיבור חשבון**. The phone opens the website. Sign in there. The page sends you back into Liitpos.

Until that is done, the register keeps working and shows that sales are stored on the device. After it is linked, the app tries to sync about every 20 seconds, and again when the network comes back.

Card terminals on the local network (the IP in settings) are separate from this cloud address. The app allows plain `http` to those devices.

## How offline and sync work

Everything the cashier does is written on the phone first (the same storage the website uses in the browser):

- sales, voids, and the receipt number
- products, categories, prices, stock counts
- club members
- held orders and the open cart
- Z reports and drawer opens
- receipt and Z printouts (the Android print dialog)
- staff PIN login

Those actions also sit in a queue. With no network, or before an account is linked, the queue waits. Nothing is thrown away because a request failed.

When a sync succeeds, records combine like this:

- **Sales, stock moves, Z reports, and drawer opens** are added. Each one has its own id, so two phones can sell offline and both sales remain. Sending the same sale again does not create a second copy. A void replaces that sale only when it is newer.
- **Products, categories, and members** are merged one by one. Editing a product on one phone does not delete a different product edited on another phone. The newer edit of the *same* product wins.
- **Stock** follows the moves (a sale, a delivery, a count), and each move is applied once. A product created offline keeps the stock it was created with.
- **Business settings and staff** use the newest save for that record.
- If two syncs overlap and a product edit is missed, the phone puts that product back in the queue on the next sync.

Receipt numbers are chosen on each phone. Two phones that were both offline can print the same number. The sales themselves stay separate.

One existing rule is unchanged: after a phone has synced once, if it then stays offline for more than seven days and nobody releases that lock from the owner panel, the register pauses sales until it syncs again. A phone that has never synced is not paused.

## Change the code, then update phones

The register that is already installed is a complete copy. With no internet it keeps selling on that copy. An update replaces the whole app. It does not download a loose web bundle, so a bad upload cannot leave the phone with half an app. Sales stored on the phone stay, because the new file is signed with the same key and uses the same id.

1. Edit the project as usual and push to `main`.
2. GitHub Actions (`.github/workflows/android-release.yml`) builds a signed APK and publishes a GitHub Release. The version number is `1000` plus the workflow run number (`1.0.1001`, then `1.0.1002`, and so on). You can also push a tag such as `v1.0.1001`. The number after the last dot is the version Android compares. The tag the workflow itself creates does not start a second build.
3. A phone that is online asks the website (`/api/pos/update`) and, if the repository is public, GitHub. If the number is higher than the installed one, a bar offers **התקנה**. The phone downloads the APK and Android asks you to confirm. Allow “install unknown apps” for Liitpos if Android asks.
4. A phone that is offline keeps the version already installed and asks again after it is back online.

You can also download `liitpos-release.apk` from the GitHub Release page and install it by hand.

This repository is private, so a phone cannot see GitHub releases by itself. Save the website address in the app, and on the host (Vercel) add an environment variable `LIITPOS_GITHUB_TOKEN`: a GitHub token that can read this repository’s releases. The website then tells the phone the new version and sends it to the file. A public repository does not need that token.

### Secrets to add on GitHub

Repo → Settings → Secrets and variables → Actions → New repository secret.

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The keystore file as one line of base64. On a computer that has the file: `base64 -w 0 liitpos-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
| `ANDROID_KEY_ALIAS` | `liitpos` |
| `ANDROID_KEY_PASSWORD` | The key password |

Use the keystore that signed the APK already installed on the phones. A new keystore cannot update those phones.

The workflow does nothing useful until those four secrets exist. It will stop and name the missing one.

## Where the keystore lives

It is not in git. Keep a copy somewhere you control (a password manager, an encrypted disk). The passwords live with it, not in the repository.

The APK attached to the pull request that added Android was signed with a new keystore. Download that keystore and the password note from the pull request artifacts, store them somewhere you control, and add the four secrets above. Then delete the extra copies. The password is not written in this document or in the pull request text.

## Google Play, later

When you want the Play Store:

1. Create a [Google Play Console](https://play.google.com/console) developer account.
2. Create an app with the id `com.liitpos.app`.
3. Prefer **Play App Signing**, and enroll the same upload key (this keystore) so updates keep installing.
4. Build an Android App Bundle in Android Studio: Build → Generate Signed Bundle / APK → Android App Bundle, using this keystore. Play Console wants an `.aab`, not the sideload APK.
5. The sideload APK and the Play build must share the application id and the signing relationship Play expects. Phones that installed the sideload APK can usually update from Play only if Play uses the same signing key. If Play generates a different app-signing key, those phones need one uninstall. Uninstalling deletes the sales stored on the phone, so sync them first.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run android:sync` | Rebuild the bundled register and copy it into the Android project |
| `npm run android:open` | Open the project in Android Studio |
| `npm run android:debug` | Debug APK |
| `npm run android:release` | Release APK (signed if the keystore variables are set) |
