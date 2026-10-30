# Second Lead · 第二主角

**Step into your favorite scene.**

Every C-drama has a second lead (男二 or 女二): the one who's always in the scene and never gets the ending. Second Lead puts you in that seat. Bring a scene from a Mandarin show you love, pick a character, and act it out aloud while an AI plays everyone else. Support fades line by line as you get comfortable, until you're speaking with no script at all. Then the other characters start going off-script, and you have to keep up.

> Status: design done, nothing built yet. See [docs/mvp.md](docs/mvp.md).

## The question

Subtitles help you recognize dialogue, not understand speech in the moment or answer out loud. Second Lead is an experiment in whether the familiarity and emotional pull of a favorite scene can carry a learner from recognizing scripted lines to understanding and speaking in a conversation they haven't heard before. How we'll judge that is in [docs/experiment.md](docs/experiment.md).

## How it works

1. **Pick a scene and a role.** Start with a built-in starter scene, or import your own from a pasted transcript or a subtitle file. Imported scenes stay private to you.
2. **Play a take.** The other characters speak their lines. You say yours. Each line shows characters with pinyin and English, and you can ask for a hint (the meaning, slower audio, a replay) at any time.
3. **Support fades.** Each line you pass drops to less support: pinyin and English, then pinyin only, then the English meaning only, then nothing.
4. **Hear your tones.** Slow or isolated playback, tone colors, record-and-compare, and a pitch contour of your voice drawn over the target.
5. **Improv.** Once most lines are bare, the other characters vary their lines. First a paraphrase, then a swapped detail, then a short detour off the script.

## Built with

Vite, React and TypeScript as a progressive web app. Supabase for accounts and data. **Sign in with ChatGPT**: you bring your own ChatGPT Plus or Pro plan, and the app never pays for or proxies your AI usage. Browser speech by default, with an optional OpenAI key for better voices. Desktop Chrome and Android Chrome are supported; iPhone needs the OpenAI key for now.

Vocabulary is in [CONTEXT.md](CONTEXT.md) and decisions are in [docs/adr/](docs/adr/).

## License

[AGPL-3.0](LICENSE).
