# SnapList AI Architecture

## Overview
SnapList AI is a multi-platform SaaS that automates ecommerce product listings using Gemini AI.

## Components

### 1. Mobile App (Flutter)
- **Purpose**: Field capture and AI generation.
- **Key Logic**: 
  - Image processing (1000x1000, JPEG).
  - Gemini 1.5 Flash API calls.
  - Firebase Storage (Images) & Firestore (Data).

### 2. Web Dashboard (React)
- **Purpose**: Desktop management and preview.
- **Key Logic**:
  - Real-time sync with Firestore.
  - Web-based camera capture.

### 3. Chrome Extension (Manifest V3)
- **Purpose**: Autofill on seller panels.
- **Key Logic**:
  - `PageScanner`: Detects form fields on Amazon, Shopify, etc.
  - `FieldMapper`: Uses keyword matching to link AI data to page fields.
  - `AutofillEngine`: Injects data and triggers change events.

## Data Flow
1. Photo taken on Mobile -> AI Generates JSON -> Saved to Firestore.
2. Extension on Desktop -> Fetches Firestore Data -> Maps to Marketplace Form -> Autofills.

## Security
- Firestore Rules: `allow read, write: if request.auth.uid == userId`.
- Storage Rules: `allow read, write: if request.auth.uid == userId`.
