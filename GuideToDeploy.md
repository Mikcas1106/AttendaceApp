# Build Android APK

## Quick build

```powershell
npm run build:apk
```

APK output:
`android\app\build\outputs\apk\debug\app-debug.apk`

## First-time setup (Windows)

1. Install **Node.js**
2. Install **Android Studio** (includes Android SDK)
3. Install **Java 21** (Eclipse Temurin recommended)

## If build fails: SDK not found

Create `android/local.properties` with your SDK path:

```properties
sdk.dir=C\:\\Users\\YOUR_USERNAME\\AppData\\Local\\Android\\Sdk
```

Or set a system environment variable:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

## If build fails: Java not found

Set Java in `android/gradle.properties`:

```properties
org.gradle.java.home=C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot
```

## Regenerate app icon

After changing `public/icon.jpg`:

```powershell
npm run generate:icons
```

## Deploy web version

```powershell
npm run deploy
```
