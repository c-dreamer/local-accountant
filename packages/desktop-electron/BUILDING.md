# LAccountant Desktop Build Handoff

Use this guide to build the `local-accountant` desktop fork on Linux or choose the matching Mac package.

## Toolchain

The repository supports Node.js `>=22.18.0` and Yarn `^4.9.1`. Its pinned versions are Node.js `24.18.1` (`.nvmrc`) and Yarn `4.17.1` (`packageManager` in the root `package.json`). CI uses Node 24.

From the repository root:

```bash
git switch master
git pull --ff-only origin master
nvm install 24.18.1
nvm use 24.18.1
corepack enable
yarn --version # 4.17.1
yarn install --immutable
```

## Linux Build

Use an Ubuntu 24.04 x64 host, matching the Electron packaging workflow. Electron 43 native modules need GCC 13. The arm64 AppImage target cross-compiles native modules, so install the arm64 cross-toolchain too.

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 python3-venv flatpak flatpak-builder crossbuild-essential-arm64
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install setuptools

sudo flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
sudo flatpak install org.freedesktop.Sdk//24.08 -y
sudo flatpak install org.freedesktop.Platform//24.08 -y
sudo flatpak install org.electronjs.Electron2.BaseApp//24.08 -y
sudo flatpak install org.flatpak.Builder -y

yarn build:desktop --skip-translations
```

The Linux configuration builds AppImage for x64 and arm64, and Flatpak for x64. Artifacts are written to `packages/desktop-electron/dist/`; their names follow the package's `LAccountant-linux-${arch}.${ext}` pattern. The equivalent command used by the Electron packaging workflow is `./bin/package-electron --skip-translations`.

The Electron PR workflow still has artifact upload paths beginning with `Actual-linux-` and ignores missing files. Until those paths are updated, inspect `dist/` directly rather than relying on uploaded Linux artifacts.

## Linux E2E Checks

The repository's desktop E2E workflow runs under Xvfb and rebuilds native modules first:

Run these checks before the installer build if you plan to keep the installer files: `yarn e2e:desktop` cleans the existing Electron `dist/` directory, then builds the app without installers.

```bash
yarn rebuild-electron
xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" -- yarn e2e:desktop
```

`yarn e2e:desktop` builds the Electron distribution without creating installers, then runs the desktop Playwright tests.

## Mac Package Choice

This Mac is `arm64`, so use `LAccountant-mac-arm64.dmg` on Apple Silicon. Use `LAccountant-mac-x64.dmg` on Intel Macs. Local Mac builds are not Developer ID signed or notarized.

## Preserve Existing Data Identity

Keep the Electron app ID `com.actualbudget.actual`, Linux executable name `actual`, and `userData` directory `<app.getPath('appData')>/Actual`. The app still uses Electron's Documents path for its existing budget documents. Do not rename these identifiers or move these paths as part of display branding; doing so can make existing installations appear to have lost their data.

Linux packaging has not yet been built or verified on a Linux host. Validate the AppImage and Flatpak outputs, native-module builds, and E2E suite there before treating them as release-ready.
