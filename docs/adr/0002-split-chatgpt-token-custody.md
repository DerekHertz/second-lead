# Split custody of ChatGPT tokens

A learner's ChatGPT refresh token is held server-side, encrypted (Supabase Vault), and never reaches the browser; the server hands the browser short-lived access tokens, and the browser calls OpenAI directly. We chose this over browser-only tokens because a refresh token spends the learner's own plan and an injected script must not be able to steal it, and over server-proxied AI calls because character turns are mid-conversation and an extra hop adds noticeable latency.

## Consequences

- AI prompts (character instructions, judging rubric) are visible in the client. Acceptable for an open-source app; nothing secret goes in a prompt.
- The optional OpenAI API key for voices is per-device and stays in the browser only.
