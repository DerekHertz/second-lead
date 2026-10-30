# Web first as a PWA, native later

The app ships first as a Vite + React + TypeScript progressive web app, supported on desktop Chrome and Android Chrome. iOS Safari's speech recognition is unreliable, so iPhone learners need the optional OpenAI key until a native shell (Capacitor or Expo) adds the platform speech recognizers. We chose this over going native from day one because the experiment is about the scene loop, which can be tested without app store review, and the speech provider interface keeps the native step contained.
