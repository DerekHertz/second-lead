// Format check for starter scenes. Zero dependencies, plain ES module, so it runs
// under `node --test` today and can be imported by a Vitest suite later.
// The format is described in docs/scenes.md.

export const CHECKS = [
  'structure',
  'line-count',
  'characters',
  'positions',
  'ids',
  'text',
  'pinyin',
  'variations',
  'paraphrase',
  'swap',
  'branch',
  'vocab',
  'exceptions',
];

const SCENE_KEYS = ['id', 'title', 'show', 'source', 'level', 'defaultRole', 'characters', 'lines', 'vocabExceptions'];
const CHARACTER_KEYS = ['id', 'name'];
const LINE_KEYS = ['id', 'character', 'position', 'hanzi', 'pinyin', 'english', 'variations'];
const TEXT_KEYS = ['hanzi', 'pinyin', 'english'];
const TURN_KEYS = ['character', ...TEXT_KEYS];
const SWAP_KEYS = ['changes', ...TEXT_KEYS, 'reply'];
const BRANCH_KEYS = ['detour', 'steerBack'];
const VARIATION_KEYS = ['paraphrase', 'swap', 'branch'];
const LEVELS = ['hsk1-2'];

// ---------- pinyin ----------

const MARKED = {
  a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ',
};
const BASE_OF = {};
const TONE_OF = {};
for (const [base, marks] of Object.entries(MARKED)) {
  [...marks].forEach((m, i) => { BASE_OF[m] = base; TONE_OF[m] = i + 1; });
}
const VOWELS = 'aeiouü' + Object.keys(BASE_OF).join('');
const INITIAL = '(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])';
// A syllable, or the stand-alone "er" syllable; never followed by a vowel
// (so a trailing n/ng that starts the next syllable backs off).
const SYLLABLE = new RegExp(`^(?:[eēéěè]r|${INITIAL}?[${VOWELS}]+(?:ng|n)?)(?![${VOWELS}])`);
const ERHUA = new RegExp(`^r(?![${VOWELS}])`);
const PUNCT = ',.?!…';

// Syllables that may be written without a tone mark (neutral tone). Anything else
// unmarked is treated as a forgotten tone mark. Three sources, all documented in
// docs/scenes.md: particles and suffixes that are always neutral, the neutral
// syllable of listed words ([word, position in word, pinyin]), and the second
// half of a reduplicated kin or verb word (māma, xièxie).
const NEUTRAL_PARTICLES = {
  的: 'de', 得: 'de', 了: 'le', 吗: 'ma', 呢: 'ne', 吧: 'ba', 么: 'me', 们: 'men',
  子: 'zi', 着: 'zhe', 过: 'guo', 个: 'ge', 啊: 'a', 呀: 'ya',
};
const NEUTRAL_WORDS = [
  ['朋友', 1, 'you'], ['喜欢', 1, 'huan'], ['告诉', 1, 'su'], ['知道', 1, 'dao'],
  ['时候', 1, 'hou'], ['漂亮', 1, 'liang'], ['认识', 1, 'shi'], ['休息', 1, 'xi'],
  ['师傅', 1, 'fu'], ['路上', 1, 'shang'], ['左边', 1, 'bian'], ['右边', 1, 'bian'],
  ['那边', 1, 'bian'], ['过去', 1, 'qu'],
];
const REDUPLICATED = '妈爸哥姐弟妹谢看';

function baseOf(syl) {
  return [...syl].map((c) => BASE_OF[c] ?? c).join('');
}
function toneOf(syl) {
  for (const c of syl) if (TONE_OF[c]) return TONE_OF[c];
  return 0;
}

/** Split one pinyin string into syllable tokens. Erhua r becomes its own token. */
export function analyzePinyin(pinyin) {
  const problems = [];
  const tokens = [];
  if (/[0-9]/.test(pinyin)) problems.push('tone digits are not allowed, use tone marks');
  if (pinyin !== pinyin.toLowerCase()) problems.push('pinyin must be lowercase');
  if (pinyin !== pinyin.trim() || /\s{2,}/.test(pinyin)) problems.push('pinyin must be single-space separated with no padding');
  for (const rawWord of pinyin.split(/\s+/).filter(Boolean)) {
    const word = rawWord.replace(new RegExp(`[${PUNCT}]+$`), '');
    if (!word) {
      problems.push(`word "${rawWord}" is only punctuation`);
      continue;
    }
    for (const part of word.split("'")) {
      let rest = part;
      let first = true;
      while (rest.length) {
        const m = SYLLABLE.exec(rest);
        if (m) {
          tokens.push({ text: m[0], base: baseOf(m[0]), tone: toneOf(m[0]), erhua: false });
          rest = rest.slice(m[0].length);
        } else if (!first && ERHUA.test(rest)) {
          tokens.push({ text: 'r', base: 'r', tone: 0, erhua: true });
          rest = rest.slice(1);
        } else {
          problems.push(`cannot read "${rest}" in "${rawWord}" as pinyin`);
          break;
        }
        first = false;
      }
    }
  }
  return { tokens, problems };
}

function neutralOk(han, tokens, i) {
  const ch = han[i];
  const base = tokens[i].base;
  if (NEUTRAL_PARTICLES[ch] === base) return true;
  if (ch === '不' && i > 0 && han[i - 1] === han[i + 1]) return true; // A不A: shì bu shì
  if (REDUPLICATED.includes(ch) && han[i - 1] === ch && tokens[i - 1].base === base) return true;
  return NEUTRAL_WORDS.some(([word, k, b]) => b === base && han.slice(i - k, i - k + word.length).join('') === word);
}

const isHan = (c) => /\p{Script=Han}/u.test(c);
const hanChars = (s) => [...s].filter(isHan);
const HANZI_PUNCT = '，。？！、…';

// ---------- helpers ----------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

export function validateScene(scene, { allowedChars, docsText, fileBase }) {
  const out = [];
  const add = (check, msg) => out.push({ check, msg });

  function onlyKeys(obj, keys, where) {
    for (const k of Object.keys(obj)) if (!keys.includes(k)) add('structure', `${where}: unknown field "${k}"`);
  }

  // A text object: hanzi, pinyin, english all present, and consistent with each other.
  function checkText(t, where) {
    if (!isObj(t)) { add('text', `${where}: must be an object`); return; }
    let ok = true;
    for (const k of TEXT_KEYS) {
      if (!isStr(t[k])) { add('text', `${where}: "${k}" must be a non-empty string`); ok = false; }
    }
    if (!ok) return;
    if (/\s/.test(t.hanzi)) add('text', `${where}: hanzi must not contain spaces`);
    const stray = [...t.hanzi].filter((c) => !isHan(c) && !HANZI_PUNCT.includes(c));
    if (stray.length) add('text', `${where}: unexpected characters in hanzi: ${stray.join(' ')}`);
    if (hanChars(t.english).length) add('text', `${where}: english must not contain Han characters`);

    const han = hanChars(t.hanzi);
    const { tokens, problems } = analyzePinyin(t.pinyin);
    for (const p of problems) add('pinyin', `${where}: ${p}`);
    if (tokens.length !== han.length) {
      add('pinyin', `${where}: ${tokens.length} pinyin syllables but ${han.length} Han characters (erhua r counts as the character 儿)`);
      return;
    }
    tokens.forEach((tok, i) => {
      const ch = han[i];
      if (tok.erhua && ch !== '儿') add('pinyin', `${where}: erhua "r" is aligned with "${ch}", not 儿`);
      if (tok.tone === 0 && !tok.erhua && !neutralOk(han, tokens, i)) {
        add('pinyin', `${where}: syllable "${tok.text}" (${ch}) has no tone mark and is not a known neutral-tone syllable`);
      }
      const next = tokens[i + 1];
      if (ch === '不') {
        if (tok.base !== 'bu') add('pinyin', `${where}: 不 is written "${tok.text}"`);
        else if (tok.tone !== 0) {
          const want = next && !next.erhua && next.tone === 4 ? 2 : 4;
          if (tok.tone !== want) add('pinyin', `${where}: 不 before ${next ? `"${next.text}"` : 'nothing'} should have tone ${want} (bú before a 4th tone, bù otherwise)`);
        }
      }
      if (ch === '一') {
        if (tok.base !== 'yi') add('pinyin', `${where}: 一 is written "${tok.text}"`);
        else {
          const numeric = i === 0 ? false : '第十二三四五六七八九零百千万'.includes(han[i - 1]);
          let want;
          if (!next || next.erhua || numeric) want = 1;
          else if (next.tone === 4 || next.base === 'ge') want = 2;
          else if (next.tone >= 1) want = 4;
          else want = 2;
          if (tok.tone !== want) add('pinyin', `${where}: 一 should have tone ${want} here (yī alone or in numbers, yí before a 4th tone or ge, yì before 1st-3rd)`);
        }
      }
    });
  }

  // ----- scene fields -----
  if (!isObj(scene)) { add('structure', 'scene must be a JSON object'); return out; }
  onlyKeys(scene, SCENE_KEYS, 'scene');
  for (const k of ['id', 'title', 'show', 'defaultRole']) {
    if (!isStr(scene[k])) add('structure', `scene.${k} must be a non-empty string`);
  }
  if (scene.source !== 'starter') add('structure', 'scene.source must be "starter"');
  if (!LEVELS.includes(scene.level)) add('structure', `scene.level must be one of ${LEVELS.join(', ')}`);
  if (scene.id !== fileBase) add('structure', `scene.id "${scene.id}" must equal the file name "${fileBase}"`);
  if (!Array.isArray(scene.characters)) add('structure', 'scene.characters must be an array');
  if (!Array.isArray(scene.lines)) add('structure', 'scene.lines must be an array');
  if (!Array.isArray(scene.vocabExceptions)) add('structure', 'scene.vocabExceptions must be an array (empty when none)');
  if (!Array.isArray(scene.characters) || !Array.isArray(scene.lines) || !Array.isArray(scene.vocabExceptions)) return out;

  // ----- characters -----
  if (scene.characters.length !== 2) add('characters', `a scene has exactly two characters, found ${scene.characters.length}`);
  const charIds = new Set();
  scene.characters.forEach((c, i) => {
    if (!isObj(c)) { add('structure', `characters[${i}] must be an object`); return; }
    onlyKeys(c, CHARACTER_KEYS, `characters[${i}]`);
    for (const k of CHARACTER_KEYS) if (!isStr(c[k])) add('structure', `characters[${i}].${k} must be a non-empty string`);
    if (charIds.has(c.id)) add('ids', `duplicate character id "${c.id}"`);
    charIds.add(c.id);
  });
  if (!charIds.has(scene.defaultRole)) add('characters', `defaultRole "${scene.defaultRole}" is not a character id`);

  // ----- lines -----
  if (scene.lines.length < 8 || scene.lines.length > 12) add('line-count', `a scene has 8-12 lines, found ${scene.lines.length}`);
  const seen = new Set([...charIds]);
  const lines = scene.lines;
  lines.forEach((line, i) => {
    const w = `line ${i + 1}`;
    if (!isObj(line)) { add('structure', `${w} must be an object`); return; }
    onlyKeys(line, LINE_KEYS, w);
    if (!isStr(line.id)) add('structure', `${w}: id must be a non-empty string`);
    else if (seen.has(line.id)) add('ids', `${w}: duplicate id "${line.id}"`);
    else seen.add(line.id);
    if (!charIds.has(line.character)) add('characters', `${w}: character "${line.character}" does not exist in this scene`);
    if (!Number.isInteger(line.position)) add('structure', `${w}: position must be an integer`);
    else if (line.position !== i + 1) add('positions', `${w}: position is ${line.position}, positions must run 1..n in order`);
    checkText(line, w);
  });

  // ----- variations -----
  lines.forEach((line, i) => {
    if (!isObj(line)) return;
    const w = `line ${i + 1}`;
    const isLearner = line.character === scene.defaultRole;
    if (isLearner) {
      if ('variations' in line) add('variations', `${w}: the default role's lines have no variations`);
      return;
    }
    const reply = lines[i + 1];
    if (!isObj(reply) || reply.character !== scene.defaultRole) {
      add('variations', `${w}: an other-character line must be followed by a default-role line (the scripted reply)`);
    }
    const v = line.variations;
    if (!isObj(v)) { add('variations', `${w}: missing variations`); return; }
    onlyKeys(v, VARIATION_KEYS, `${w}.variations`);
    for (const k of VARIATION_KEYS) if (!isObj(v[k])) add('variations', `${w}: missing ${k}`);

    // Paraphrase
    if (isObj(v.paraphrase)) {
      const p = v.paraphrase;
      onlyKeys(p, TEXT_KEYS, `${w}.paraphrase`);
      checkText(p, `${w} paraphrase`);
      if (p.hanzi === line.hanzi) add('paraphrase', `${w}: paraphrase is identical to the line`);
      if (isObj(v.swap) && p.hanzi === v.swap.hanzi) add('paraphrase', `${w}: paraphrase is identical to the swap`);
    }

    // Swap
    if (isObj(v.swap)) {
      const s = v.swap;
      onlyKeys(s, SWAP_KEYS, `${w}.swap`);
      if (!isStr(s.changes)) add('swap', `${w}: swap.changes must say which detail changed`);
      checkText(s, `${w} swap`);
      if (s.hanzi === line.hanzi) add('swap', `${w}: swap is identical to the line`);
      if (!isObj(s.reply)) add('swap', `${w}: swap needs a matching learner reply`);
      else {
        onlyKeys(s.reply, TEXT_KEYS, `${w}.swap.reply`);
        checkText(s.reply, `${w} swap reply`);
        if (isObj(reply) && s.reply.hanzi === reply.hanzi) add('swap', `${w}: swap reply is identical to the scripted reply, it must change with the detail`);
      }
    }

    // Branch
    if (isObj(v.branch)) {
      const b = v.branch;
      onlyKeys(b, BRANCH_KEYS, `${w}.branch`);
      if (!Array.isArray(b.detour) || b.detour.length !== 2) add('branch', `${w}: branch.detour must be exactly two turns (other character, then learner)`);
      else {
        const [d0, d1] = b.detour;
        for (const [d, label] of [[d0, 'detour[0]'], [d1, 'detour[1]']]) {
          if (!isObj(d)) { add('branch', `${w}: ${label} must be an object`); continue; }
          onlyKeys(d, TURN_KEYS, `${w}.${label}`);
          checkText(d, `${w} branch ${label}`);
        }
        if (isObj(d0) && d0.character !== line.character) add('branch', `${w}: detour[0] must be spoken by the line's character`);
        if (isObj(d1) && d1.character !== scene.defaultRole) add('branch', `${w}: detour[1] must be spoken by the default role`);
      }
      if (!isObj(b.steerBack)) add('branch', `${w}: branch.steerBack is required`);
      else {
        onlyKeys(b.steerBack, TURN_KEYS, `${w}.steerBack`);
        checkText(b.steerBack, `${w} branch steerBack`);
        if (b.steerBack.character !== line.character) add('branch', `${w}: steerBack must be spoken by the line's character`);
      }
    }
  });

  // ----- vocabulary -----
  const texts = [];
  const collect = (t) => { if (isObj(t) && typeof t.hanzi === 'string') texts.push(t.hanzi); };
  for (const line of lines) {
    if (!isObj(line)) continue;
    collect(line);
    const v = line.variations;
    if (!isObj(v)) continue;
    collect(v.paraphrase);
    collect(v.swap);
    collect(v.swap?.reply);
    (v.branch?.detour ?? []).forEach(collect);
    collect(v.branch?.steerBack);
  }
  const all = texts.join('');
  const exceptionChars = new Set();
  scene.vocabExceptions.forEach((e, i) => {
    const w = `vocabExceptions[${i}]`;
    if (!isObj(e) || !isStr(e.word) || !isStr(e.reason)) { add('exceptions', `${w} needs a "word" and a "reason"`); return; }
    onlyKeys(e, ['word', 'reason'], w);
    if (hanChars(e.word).length !== [...e.word].length) add('exceptions', `${w}: word must be Han characters only`);
    if (!all.includes(e.word)) add('exceptions', `${w}: "${e.word}" does not appear in the scene`);
    if (![...e.word].some((c) => !allowedChars.has(c))) add('exceptions', `${w}: "${e.word}" is already within the HSK 1-2 characters, drop the exception`);
    if (!docsText.includes(e.word)) add('exceptions', `${w}: "${e.word}" is not listed in docs/scenes.md`);
    for (const c of e.word) exceptionChars.add(c);
  });
  const outside = new Map();
  for (const t of texts) {
    for (const c of t) {
      if (isHan(c) && !allowedChars.has(c) && !exceptionChars.has(c)) outside.set(c, (outside.get(c) ?? 0) + 1);
    }
  }
  for (const [c] of outside) add('vocab', `"${c}" is outside HSK 1-2 and is not in vocabExceptions`);

  return out;
}
