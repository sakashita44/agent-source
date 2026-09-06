import { test } from 'node:test';
import assert from 'node:assert';
import { checkLinks } from '../check-links.mjs';

test('check-links - Ambiguous links are detected', async () => {
  const markdown = `
# 検出
[ここ](guide-ja.md)
[ こちら ](guide-space.md)
[HERE](guide-en.md)
[Click Here][click]
[this link][target]

[click]: click.md
[target]: target.md
`;

  const result = (await checkLinks(markdown, async () => {})).join('\n');
  assert.match(result, /\[要見直し\] L3 「ここ」 -> guide-ja\.md/);
  assert.match(result, /\[要見直し\] L4 「こちら」 -> guide-space\.md/);
  assert.match(result, /\[要見直し\] L5 「HERE」 -> guide-en\.md/);
  assert.match(result, /\[要見直し\] L6 「Click Here」 -> click\.md/);
  assert.match(result, /\[要見直し\] L7 「this link」 -> target\.md/);
});

test('check-links - Non-ambiguous forms are ignored', async () => {
  const markdown = `
# 非検出
![ここ](image.png)
<https://example.com/here>
[here]: definition.md
\`[here](inline-code.md)\`
[詳細な設定](settings.md)
[リンク](links.md)

\`\`\`markdown
[here](fenced-backtick.md)
\`\`\`

~~~markdown
[こちら](fenced-tilde.md)
~~~
`;

  const result = (await checkLinks(markdown, async () => {})).join('\n');
  assert.match(result, /\[曖昧なリンク文言\]\n  なし/);
  assert.doesNotMatch(result, /\[要見直し\]/);
});

test('check-links - Reachability check via mock fetch', async () => {
  const markdown = `
[良いリンク](https://example.com/good)
[悪いリンク](https://example.com/bad)
`;
  const mockFetch = async (url, options) => {
    if (url === 'https://example.com/bad') {
      return { ok: false, status: 404 };
    }
    return { ok: true, status: 200 };
  };

  const result = (await checkLinks(markdown, mockFetch)).join('\n');
  assert.doesNotMatch(result, /良いリンク/);
  assert.match(result, /悪いリンク.*到達不可: 404/);
});

test('check-links - 到達性の指摘を曖昧な文言と別の節へ出す', async () => {
  const markdown = `
[こちら](https://example.com/bad)
`;
  const mockFetch = async () => ({ ok: false, status: 404 });

  const result = (await checkLinks(markdown, mockFetch, { checkReachability: true })).join('\n');
  const ambiguousSection = result.split('[リンクの到達性]')[0];
  const reachabilitySection = result.split('[リンクの到達性]')[1];

  assert.match(ambiguousSection, /\[要見直し\] L2 「こちら」/);
  assert.doesNotMatch(ambiguousSection, /到達不可/);
  assert.match(reachabilitySection, /到達不可: 404/);
});

test('check-links - 全件が通信エラーならスキップとして報告する', async () => {
  const markdown = `
[設定の手引き](https://example.com/a)
[運用の手引き](https://example.com/b)
`;
  const mockFetch = async () => { throw new Error('getaddrinfo ENOTFOUND'); };

  const result = (await checkLinks(markdown, mockFetch, { checkReachability: true })).join('\n');
  assert.match(result, /スキップ: ネットワークへ到達できない（対象 2 件）/);
  assert.doesNotMatch(result, /到達不可/);
});

test('check-links - 到達性を求めない場合は節自体を出さない', async () => {
  const markdown = `
[設定の手引き](https://example.com/a)
`;
  let called = false;
  const mockFetch = async () => { called = true; return { ok: true, status: 200 }; };

  const result = (await checkLinks(markdown, mockFetch, { checkReachability: false })).join('\n');
  assert.doesNotMatch(result, /\[リンクの到達性\]/);
  assert.equal(called, false);
});
