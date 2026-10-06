# ChildSafeLens Demo Input App (B)

Expo app: a text input, a Send button, and the pre-emptive nudge overlay.
This is the "child types a message" side of the demo.

## 1. Set up a fresh Expo project and drop these files in

Easiest path — create a new Expo app, then replace its default files with
the ones here:

```bash
npx create-expo-app childsafelens-input
cd childsafelens-input
```

Copy `App.js` and `api.js` from this folder into the new project, replacing
the generated `App.js`. No extra native dependencies are needed — this uses
only core React Native components (`View`, `TextInput`, `Modal`, etc.), so
there's nothing else to install.

## 2. Point it at the backend

Set `EXPO_PUBLIC_API_BASE_URL` when the backend is not reachable through the
local defaults:

```js
EXPO_PUBLIC_API_BASE_URL=https://<your-backend-host>
```

On web, the app connects to the backend at the same hostname on port 8000.
On an Android emulator, it connects through `http://10.0.2.2:8000`. For a
physical phone, set `EXPO_PUBLIC_API_BASE_URL` to the laptop's LAN URL
(for example `http://192.168.1.23:8000`); do not use `localhost` on the
phone because that points to the phone itself.

## 3. Run it

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone (Android or iOS), or press `a`
for an Android emulator / `i` for an iOS simulator if you have one set up.

## 4. What to check works before the demo

- Typing a normal message and hitting Send: no nudge, message logs as
  `low_risk` in the "Recent activity" list.
- Typing something from your risky test set: the nudge modal appears with
  "Edit message" / "Send anyway".
- Tapping "Send anyway" logs the event and clears the input.
- Tapping "Edit message" closes the nudge and keeps your text in the box
  so you can change it live during the demo.

## 5. If C's backend isn't ready yet

You don't have to wait — temporarily point `API_BASE_URL` at
`http://localhost:8000` and run C's backend locally on your own machine
(see `backend/README.md`) to keep testing the UI end-to-end.
