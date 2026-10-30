// Run: node --test content/scenes/scenes.test.mjs
// Zero dependencies (node:test + node:assert). The checks live in validate.mjs so a
// Vitest suite can import them later. Format: docs/scenes.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CHECKS, validateScene, analyzePinyin } from './validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCENES = ['family-dinner', 'taxi'];
const ALLOWLIST_FILE = 'hsk12-chars.json';
const DOCS = join(here, '..', '..', 'docs', 'scenes.md');

function readJson(file) {
  try {
    return { data: JSON.parse(readFileSync(join(here, file), 'utf8')) };
  } catch (e) {
    return { error: e.message };
  }
}

const allowlist = readJson(ALLOWLIST_FILE);
const allowedChars = new Set(typeof allowlist.data?.characters === 'string' ? [...allowlist.data.characters] : []);
const docsText = existsSync(DOCS) ? readFileSync(DOCS, 'utf8') : '';
const loaded = Object.fromEntries(SCENES.map((name) => [name, readJson(`${name}.json`)]));

function problems(name, check) {
  const { data, error } = loaded[name];
  assert.ok(data, `${name}.json did not load: ${error}`);
  return validateScene(data, { allowedChars, docsText, fileBase: name })
    .filter((p) => p.check === check)
    .map((p) => p.msg);
}

describe('inputs', () => {
  test('the HSK 1-2 character allowlist exists and is a compiled list', () => {
    assert.ok(allowlist.data, `${ALLOWLIST_FILE} did not load: ${allowlist.error}`);
    assert.equal(typeof allowlist.data.note, 'string');
    assert.match(allowlist.data.note, /verif/i, 'the note must say the list needs verification');
    assert.ok(allowedChars.size >= 250 && allowedChars.size <= 600, `unexpected size ${allowedChars.size}`);
  });

  test('docs/scenes.md exists, with an Open section naming each scene', () => {
    assert.ok(existsSync(DOCS), 'docs/scenes.md is missing');
    const open = docsText.split(/^## /m).find((s) => /^Open\b/i.test(s));
    assert.ok(open, 'docs/scenes.md needs an "## Open" section');
    for (const name of SCENES) assert.ok(open.includes(name), `Open section must list the naturalness check for ${name}`);
    assert.match(open, /native/i);
  });

  test('exactly the two starter scene files exist in content/scenes', () => {
    const files = readdirSync(here).filter((f) => f.endsWith('.json') && f !== ALLOWLIST_FILE).sort();
    assert.deepEqual(files, SCENES.map((n) => `${n}.json`).sort());
  });
});

for (const name of SCENES) {
  describe(`${name}.json`, () => {
    test('parses as JSON', () => {
      assert.ok(loaded[name].data, `${name}.json did not load: ${loaded[name].error}`);
    });

    for (const check of CHECKS) {
      test(`check: ${check}`, () => {
        assert.deepEqual(problems(name, check), []);
      });
    }

    test('the learner plays the kid / passenger role by default', () => {
      const { data } = loaded[name];
      assert.ok(data, 'scene did not load');
      assert.equal(data.defaultRole, name === 'taxi' ? 'passenger' : 'kid');
    });

    test('every non-default line has all three variations and every default line none', () => {
      const { data } = loaded[name];
      assert.ok(data, 'scene did not load');
      const other = data.lines.filter((l) => l.character !== data.defaultRole);
      assert.ok(other.length >= 4, 'expected at least four lines by the other character');
      for (const l of other) {
        assert.deepEqual(Object.keys(l.variations).sort(), ['branch', 'paraphrase', 'swap'], l.id);
      }
      for (const l of data.lines.filter((x) => x.character === data.defaultRole)) {
        assert.equal(l.variations, undefined, l.id);
      }
    });
  });
}

describe('across scenes', () => {
  test('line ids are unique across both scenes', () => {
    const ids = SCENES.flatMap((n) => (loaded[n].data?.lines ?? []).map((l) => l.id));
    assert.ok(ids.length >= 16, 'both scenes must load');
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('the checks bite', () => {
  // Mutate a copy of the family dinner and confirm the right check notices.
  const mutate = (fn) => {
    const { data } = loaded['family-dinner'];
    assert.ok(data, 'family-dinner.json did not load');
    const copy = structuredClone(data);
    fn(copy);
    return validateScene(copy, { allowedChars, docsText, fileBase: 'family-dinner' });
  };
  const flagged = (list, check) => list.filter((p) => p.check === check).length > 0;
  const firstOther = (s) => s.lines.find((l) => l.character !== s.defaultRole);

  test('a tone digit is flagged', () => {
    assert.ok(flagged(mutate((s) => { s.lines[0].pinyin = 'duo1 chi1 dianr'; }), 'pinyin'));
  });
  test('a missing tone mark is flagged', () => {
    assert.ok(flagged(mutate((s) => { s.lines[1].pinyin = s.lines[1].pinyin.replace('wǒ', 'wo'); }), 'pinyin'));
  });
  test('bù before a 4th tone (sandhi) is flagged', () => {
    assert.ok(flagged(mutate((s) => {
      const p = firstOther(s).variations.paraphrase;
      assert.match(p.pinyin, /bú shì/);
      p.pinyin = p.pinyin.replace('bú shì', 'bù shì');
    }), 'pinyin'));
  });
  test('yī before a 3rd tone (sandhi) is flagged', () => {
    assert.ok(flagged(mutate((s) => {
      assert.match(s.lines[2].pinyin, /yì diǎnr/);
      s.lines[2].pinyin = s.lines[2].pinyin.replace('yì diǎnr', 'yī diǎnr');
    }), 'pinyin'));
  });
  test('a syllable count that differs from the Han count is flagged', () => {
    assert.ok(flagged(mutate((s) => { s.lines[1].hanzi += '了'; }), 'pinyin'));
  });
  test('a missing swap is flagged', () => {
    assert.ok(flagged(mutate((s) => { delete firstOther(s).variations.swap; }), 'variations'));
  });
  test('an unchanged swap reply is flagged', () => {
    assert.ok(flagged(mutate((s) => {
      const i = s.lines.indexOf(firstOther(s));
      const v = firstOther(s).variations;
      v.swap.reply = { hanzi: s.lines[i + 1].hanzi, pinyin: s.lines[i + 1].pinyin, english: s.lines[i + 1].english };
    }), 'swap'));
  });
  test('a paraphrase equal to the line is flagged', () => {
    assert.ok(flagged(mutate((s) => { const l = firstOther(s); l.variations.paraphrase = { hanzi: l.hanzi, pinyin: l.pinyin, english: l.english }; }), 'paraphrase'));
  });
  test('a branch without a steer-back is flagged', () => {
    assert.ok(flagged(mutate((s) => { delete firstOther(s).variations.branch.steerBack; }), 'branch'));
  });
  test('variations on a learner line are flagged', () => {
    assert.ok(flagged(mutate((s) => { s.lines[1].variations = {}; }), 'variations'));
  });
  test('a word outside HSK 1-2 without an exception is flagged', () => {
    assert.ok(flagged(mutate((s) => { s.lines[1].hanzi = '妈，我已经吃了很多了。'.replace('吃', '餐'); }), 'vocab'));
  });
  test('an exception that is not in docs/scenes.md is flagged', () => {
    assert.ok(flagged(mutate((s) => { s.vocabExceptions.push({ word: '鑫', reason: 'x' }); }), 'exceptions'));
  });
  test('a non-contiguous position is flagged', () => {
    assert.ok(flagged(mutate((s) => { s.lines[2].position = 7; }), 'positions'));
  });
  test('a third character is flagged', () => {
    assert.ok(flagged(mutate((s) => { s.characters.push({ id: 'dad', name: 'Dad' }); }), 'characters'));
  });
  test('bú before a 4th tone and erhua are read correctly', () => {
    assert.deepEqual(analyzePinyin('bú shì nǎr, yì diǎnr').problems, []);
    assert.equal(analyzePinyin('bú shì nǎr, yì diǎnr').tokens.length, 7);
    assert.notDeepEqual(analyzePinyin('ni3 hao3').problems, []);
  });
});
