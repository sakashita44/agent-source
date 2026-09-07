import { test } from 'node:test';
import assert from 'node:assert';
import { checkKanji } from '../check-kanji.mjs';

test('check-kanji - detects kanji correctly', () => {
  const data = {
    joyoSet: new Set(['私', '日', '本', '語']),
    simplifiedSet: new Set(['从']),
    pairs: [
      { kanji: '及び', kana: 'および' }
    ]
  };

  const markdown = `
私は日本語を話します。从
及び と および
`;
  const result = checkKanji(markdown, data).join('\n');
  assert.match(result, /从 \(line 2\) — 日本語では使われない簡体字。/);
  assert.match(result, /話 \(line 2\) — 表外字。/);
  assert.match(result, /「及び」1 件 \/ 「および」1 件 — 表記を統一/);
});

test('check-kanji - code fences are ignored', () => {
  const data = {
    joyoSet: new Set(['あ']),
    simplifiedSet: new Set(['从']),
    pairs: []
  };

  const markdown = `
\`\`\`
从
\`\`\`
\`/从/\`
`;
  const result = checkKanji(markdown, data).join('\n');
  assert.doesNotMatch(result, /从/);
});
