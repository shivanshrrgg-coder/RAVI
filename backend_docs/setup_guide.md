# SnapList AI Setup Guide

## 1. Firebase Setup
- The backend is already provisioned in AI Studio.
- Firestore rules are deployed.
- Storage is initialized.

## 2. Flutter Mobile App
- Navigate to `mobile_app/`.
- Run `flutter pub get`.
- Replace `YOUR_GEMINI_API_KEY` in `lib/services/ai_service.dart`.
- Add your `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from the Firebase Console.
- Run `flutter run`.

## 3. Chrome Extension
- Open Chrome and go to `chrome://extensions/`.
- Enable "Developer mode".
- Click "Load unpacked".
- Select the `chrome_extension/` folder.
- Open a seller page (e.g., Shopify Admin) and click the extension icon to sync.

## 4. AI Studio Preview
- The interactive dashboard in the preview pane allows you to test the full flow:
  - Login with Google.
  - Capture product photo (simulated/real camera).
  - Generate AI listing.
  - Save to cloud.
