import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WARN_COUNT = 3;
const REVIEW_COUNT = 5;

export function removeCodeFence(lines) {
  const out = [];
  let fence = null;
  for (const line of lines) {
    if (fence === null) {
      const match = line.match(/^\s*(`{3,}|~{3,})/);
      if (match) {
        fence = match[1].charAt(0);
        out.push('');
        continue;
      }
      out.push(line);
    } else {
      const closingRegex = new RegExp(`^\\s*(${fence}{3,})\\s*$`);
      if (closingRegex.test(line)) {
        fence = null;
      }
      out.push('');
    }
  }
  return out;
}

export function getHeadings(lines) {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match) {
      items.push({
        level: match[1].length,
        text: match[2],
        line: i + 1
      });
    }
  }
  return items;
}

export function getListBlocks(lines) {
  const blocks = [];
  let current = null;
  let blank = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)([-*+]|\d+\.)\s+\S/);
    if (match) {
      const indent = match[1].replace(/\t/g, '    ').length;
      if (current === null) {
        current = { start: i + 1, indents: [] };
      }
      current.indents.push(indent);
      blank = 0;
    } else if (/^\s*$/.test(line)) {
      blank++;
      if (blank >= 2 && current !== null) {
        blocks.push(current);
        current = null;
      }
    } else if (/^\S/.test(line)) {
      if (current !== null) {
        blocks.push(current);
        current = null;
      }
    }
  }
  if (current !== null) {
    blocks.push(current);
  }
  return blocks;
}

export function getParentText(headings, index) {
  const level = headings[index].level;
  for (let j = index - 1; j >= 0; j--) {
    if (headings[j].level < level) return headings[j].text;
  }
  return '(文書直下)';
}

export function checkStructure(rawText) {
  const lines = rawText.split(/\r?\n/);
  const outLines = [];
  
  const noFenceLines = removeCodeFence(lines);
  const headings = getHeadings(noFenceLines);

  if (headings.length === 0) {
    outLines.push("  見出しなし", "");
    return outLines;
  }

  outLines.push("[見出しツリー]");
  for (const h of headings) {
    const indent = '  '.repeat(h.level - 1);
    outLines.push(`  ${indent}${'#'.repeat(h.level)} ${h.text}  (L${h.line})`);
  }
  outLines.push("");

  const groups = new Map();
  for (let i = 0; i < headings.length; i++) {
    const key = `${getParentText(headings, i)}\t${headings[i].level}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(headings[i]);
  }

  const countFindings = [];
  for (const [key, group] of groups.entries()) {
    const n = group.length;
    if (n < WARN_COUNT) continue;
    const parts = key.split("\t");
    const sev = n >= REVIEW_COUNT ? '要見直し' : '注意';
    const names = group.map(h => h.text).join(' / ');
    countFindings.push(`  [${sev}] 「${parts[0]}」直下に H${parts[1]} が ${n} 個: ${names}`);
  }

  const listFindings = [];
  for (const b of getListBlocks(noFenceLines)) {
    const min = Math.min(...b.indents);
    const n = b.indents.filter(i => i === min).length;
    if (n >= REVIEW_COUNT) {
      listFindings.push(`  [確認] L${b.start} 付近のリストに同一階層の項目が ${n} 個`);
    }
  }

  outLines.push("[同一階層の見出し数]");
  if (countFindings.length === 0) {
    outLines.push("  なし");
  } else {
    outLines.push(...countFindings);
  }
  outLines.push("");

  const skips = [];
  for (let i = 1; i < headings.length; i++) {
    const gap = headings[i].level - headings[i - 1].level;
    if (gap >= 2) {
      skips.push(`  [要見直し] L${headings[i].line} 「${headings[i].text}」: H${headings[i-1].level} の直後に H${headings[i].level}（中間階層が欠落）`);
    }
  }

  outLines.push("[見出しレベルの飛び]");
  if (skips.length === 0) {
    outLines.push("  なし");
  } else {
    outLines.push(...skips);
  }
  outLines.push("");

  outLines.push("[リストの項目数]");
  if (listFindings.length === 0) {
    outLines.push("  なし");
  } else {
    outLines.push(...listFindings);
    outLines.push("  ※ 同種の語の列挙（用語定義・チェック項目・選択肢）は項目数が多くても分割を要さない");
  }
  outLines.push("");

  const mismatch = [];
  for (const [key, siblings] of groups.entries()) {
    if (siblings.length < 2) continue;

    const shapes = siblings.map(s => {
      const idx = headings.indexOf(s);
      const kids = [];
      for (let j = idx + 1; j < headings.length; j++) {
        if (headings[j].level <= s.level) break;
        if (headings[j].level === s.level + 1) kids.push(headings[j].text);
      }
      return { name: s.text, kids, norm: kids.map(k => k.split(/[:：]/)[0].trim()) };
    });

    const withKids = shapes.filter(s => s.kids.length > 0);
    if (withKids.length < 2) continue;

    const parts = key.split("\t");
    for (let a = 0; a < withKids.length; a++) {
      for (let b = a + 1; b < withKids.length; b++) {
        const x = withKids[a];
        const y = withKids[b];
        const shared = x.norm.filter(n => y.norm.includes(n)).length;
        if (shared === 0) continue;
        if (shared === x.norm.length && shared === y.norm.length) continue;
        mismatch.push(`  「${parts[0]}」直下の H${parts[1]}: 下位構成が部分的にしか一致しない`);
        mismatch.push(`      ${x.name}: ${x.kids.join(' / ')}`);
        mismatch.push(`      ${y.name}: ${y.kids.join(' / ')}`);
      }
    }
  }

  outLines.push("[対等な節の下位構成]");
  if (mismatch.length === 0) {
    outLines.push("  不一致なし");
  } else {
    outLines.push(...mismatch);
    outLines.push("  ※ 対象の性質から生じた差（特定要素だけの補足、他要素に存在しない内容）は逸脱として正当。");
    outLines.push("     対等な要素かどうかと、差に理由があるかはサブエージェントが判断する");
  }
  outLines.push("");

  return outLines;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let paths = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path' && i + 1 < args.length) {
      paths.push(args[++i]);
    } else if (!args[i].startsWith('--')) {
      paths.push(args[i]);
    }
  }

  if (paths.length === 0) {
    console.error("Usage: node check-structure.mjs --path <file1> <file2> ...");
    process.exit(1);
  }

  for (const p of paths) {
    console.log(`=== ${p} ===`);
    if (!fs.existsSync(p)) {
      console.log("  ファイルが見つからない\n");
      continue;
    }
    const raw = fs.readFileSync(p, 'utf8');
    const outLines = checkStructure(raw);
    outLines.forEach(l => console.log(l));
  }
}
