# Design

How Second Lead looks and feels, decided in the design grilling on 2026-10-30. Terms are defined in [CONTEXT.md](../CONTEXT.md); what each part does is in [mvp.md](mvp.md). The approved clickable mockup is [mockups/packet.html](mockups/packet.html): open it in a browser. It is a reference, not app code.

## The metaphor

The app is an actor's script: a stapled packet of sides. Every screen is paper on a desk: a take is reading a scene off the page, fading is covering your lines to rehearse, feedback is a director's pencil.

## Mood

- **Paper script.** Warm off-white paper on a darker desk surface, near-black ink. Character names and stage directions in a monospaced typewriter face (the screenplay convention); characters in a clean CJK face.
- **Your role** gets a soft highlighter wash on its lines, like a highlighted actor's script.
- **Dark mode** is the script under a desk lamp: warm charcoal, not pure black.
- **Tone colors own the color.** Pinyin syllables carry four tone colors plus neutral ([#11](https://github.com/DerekHertz/second-lead/issues/11)), so everything else stays a calm warm neutral. No green/red for pass or miss.

## The take screen

A **packet** stapled at the top-left corner: a title page, script pages, and an end page, with the edges of the pages still to come stacked beneath the top one, so the stack itself shows how much is left.

- **A page holds a few exchanges** (about four lines). On the top page, the current line is marked with a rule in the margin, earlier lines are dimmed and later lines faint; a long page scrolls to keep the current line in view.
- **Pages flip up over the staple.** When the last line on a page is done, the page lifts toward the learner and over the top, shading as it goes, and the next page slides up from the stack. "Begin" flips the title page the same way, and the last script page flips to the end page.
- **Flipping back** to an earlier page is for review; the dock then offers "Back to your page".
- Script pages carry a page number top right and **(CONTINUED)** at the foot, as screenplay sides do.

### Your lines

- **Interlinear.** Pinyin above each word, characters, then the English below in italics, set like a screenplay parenthetical. At the top support level all three show.
- **Slips.** Fading covers a row with a paper slip rather than removing it. At "nothing", the slip shows one tick per syllable so the learner knows the line's length.
- **Lifting a slip is a hint.** Tapping a slip lifts it and is counted as a meaning hint. Hints live where the missing text is, not in a separate button.

### The other characters' lines

- **Scripted takes:** full text (pinyin, characters, English).
- **Improv:** the line stays under a slip until its audio finishes, because the variation is what must be heard. Lifting it early is a hint.
- A per-take **"listen first"** toggle applies the improv behaviour to scripted takes.

### Controls

- A **bottom dock** in thumb reach: a big mic in the center, replay and slower on one side, the take menu on the other. "It misheard me" and "flip the verdict" appear in the dock only after an attempt.
- **Auto-cue.** When the other character's line ends, the mic opens by itself, shown by a clear pulsing "your cue" state. A tap pauses it or starts it by hand. A setting turns auto-cue off.

### Feedback

Pencil marks on the script, showing detail only when it is needed:

- **Pass:** a pencil check in the margin and a tone note ("tones 4/6"); the scene moves on after a beat.
- **Miss:** a wavy pencil underline under the missed syllables and "heard: …" in small typewriter text below the line, like a stage direction. The script waits on the line for a retry.
- Tapping the tone note opens tone detail ([#11](https://github.com/DerekHertz/second-lead/issues/11), [#12](https://github.com/DerekHertz/second-lead/issues/12)).
- Marks stay on finished lines, so scrolling up shows how the take went.

## Getting to a take

- **Shelf.** Home is a desk of stapled packets, one per scene: title, show, characters, and a small progress mark (how many of the learner's lines have faded, and whether improv is unlocked). Import ([#10](https://github.com/DerekHertz/second-lead/issues/10)) is a blank cover at the end of the shelf.
- **Continue.** Once the learner has takes, a "Continue as <role>" card sits above the shelf.
- **Title page.** Tapping a packet opens it at its first page, a screenplay title page: title, logline and a cast of characters. Tapping a name picks the role (it takes the highlighter); "Begin" starts the take.

## End of a take

The last page of the packet opens with **— 完 —**, and the rest sits on that page:

1. **Check-in first:** four tap targets with words, *rough · shaky · solid · owned it* (1–4), and an optional note. It comes before the summary so the numbers cannot bias the rating ([experiment.md](experiment.md) reads check-ins).
2. **A small summary:** lines faded this take, hints used, lines missed. The marked-up script above already tells most of the story.
3. **Again · Swap roles · Back to shelf.** "Again" flips the packet back to page 1; "Swap roles" flips it back to the title page.

## Not decided yet

Typefaces and exact colors (including the four tone colors), the progress view, sign-in ([#7](https://github.com/DerekHertz/second-lead/issues/7), [#8](https://github.com/DerekHertz/second-lead/issues/8)), the import review screen, tone-detail layout, motion.
