# ChatGPT login for text AI, browser speech by default

Learners bring their own AI: they sign in with ChatGPT and the app uses their plan through the Responses API to play characters, structure imported scenes, explain lines and judge improv. Plan login covers text only (audio, realtime and transcription are excluded as of Oct 2026), so speech defaults to the browser's Web Speech API, and an optional OpenAI API key in settings unlocks better voices. We chose this over a Claude backend because Claude consumer-plan OAuth is not usable in third-party apps, and over hosting speech ourselves because the app should not pay for any learner's AI usage.

## Consequences

- Chrome is the supported browser; Firefox has no speech recognition.
- Tone tools (pitch contour, record-and-compare) run in the browser and do not depend on the speech provider.
- Speech sits behind one provider interface (synthesize, recognize, optionally assess). Azure Speech is wired in for the maintainer's own use only (student credits are non-commercial); exposing it as a learner-supplied key later is a settings change.
- If OpenAI opens audio to plan login, the API key setting can go.
