# Walkthrough - Parent Account & Child Profile Mapping

Successfully mapped the Android Child App and React Native Parent Dashboard using **Parent Email** and **Child Name** so that safety incidents and alerts are correctly associated and filtered per family/child.

## Changes

### 1. Backend (`backend/main.py`)
- Updated `IncidentCreate` schema to include `parentEmail` and `childName`.
- Updated `GET /incidents` and `GET /events` to support query parameters `parentEmail` and `childName` for filtering.

### 2. Android Child App (`IncidentManager.kt`, `IncidentEntity.kt`)
- Updated `IncidentEntity` and `IncidentManager` to automatically fetch the active parent email and active child profile name from `SessionManager` and include them in incident payloads sent to the backend.

### 3. React Native Parent Dashboard (`alertsService.ts`, `app/dashboard.tsx`)
- Updated `fetchAlerts` and `fetchDashboardStats` to accept `parentEmail` and `childName` and pass them as query parameters (`?parentEmail=...&childName=...`) to filter incidents displayed on the parent dashboard.

## Verification Results
- Build successful (`BUILD SUCCESSFUL` with `./gradlew assembleDebug`).
- Mapped connection established between child app sessions and parent dashboard views.
