import { test } from 'node:test';
import assert from 'node:assert';
import { checkStructure } from '../check-structure.mjs';

test('check-structure - detects structure correctly', () => {
  const markdown = `
# Title

## Section 1
Content

## Section 2
- Item A
- Item B
- Item C
- Item D
- Item E

## Section 3
### Sub 3.1
### Sub 3.2
### Sub 3.3

### Sub 3.4
  `;

  const result = checkStructure(markdown).join('\n');
  assert.match(result, /\[同一階層の見出し数\]/);
  assert.match(result, /\[確認\] L8 付近のリストに同一階層の項目が 5 個/);
  
  assert.match(result, /\[注意\] 「Section 3」直下に H3 が 4 個: Sub 3\.1 \/ Sub 3\.2 \/ Sub 3\.3 \/ Sub 3\.4/);
});

test('check-structure - skip level detection', () => {
  const markdown = `
# Title
### Bad Sub
`;
  const result = checkStructure(markdown).join('\n');
  assert.match(result, /\[要見直し\] L3 「Bad Sub」: H1 の直後に H3（中間階層が欠落）/);
});
