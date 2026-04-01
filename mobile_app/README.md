# SnapList AI - Flutter Mobile App

This directory contains the production-ready Flutter code for the SnapList AI mobile application.

## Features
- Camera capture with image processing (1000x1000, JPEG, EXIF removal).
- Firebase Authentication (Google Login).
- Gemini AI integration for product analysis.
- Firestore for listing storage.
- Firebase Storage for image hosting.

## Structure
- `lib/main.dart`: Entry point and routing.
- `lib/services/ai_service.dart`: Gemini API integration.
- `lib/services/firebase_service.dart`: Firestore & Storage logic.
- `lib/ui/camera_screen.dart`: Custom camera interface.
- `lib/ui/listing_preview.dart`: AI result display and editing.
