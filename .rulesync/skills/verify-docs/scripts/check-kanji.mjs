import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(path.dirname(__dirname), 'data');

export function readCharSet(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const set = new Set();
  const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
  for (const { segment } of segmenter.segment(text)) {
    set.add(segment);
  }
  return set;
}

export function loadData() {
  const joyoSet = readCharSet(path.join(dataDir, 'joyo-kanji.txt'));
  const simplifiedSet = readCharSet(path.join(dataDir, 'simplified-chinese.txt'));

  const pairsText = fs.readFileSync(path.join(dataDir, 'hyoki-yure.tsv'), 'utf8');
  const pairs = pairsText.split(/\r?\n/)
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const cols = line.split('\t');
      return { kanji: cols[0], kana: cols[1] };
    });

  return { joyoSet, simplifiedSet, pairs };
}

export function stripCodeSpans(line, inFenceObj) {
  // 開始フェンスの文字と長さを記録し、同じ文字で同じ長さ以上の行までを除外する。
  // 単純なトグルでは、チルダフェンスと、入れ子にしたフェンスを扱えない。
  if (!inFenceObj.value) {
    const opening = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (opening) {
      inFenceObj.value = true;
      inFenceObj.char = opening[1].charAt(0);
      inFenceObj.length = opening[1].length;
      return '';
    }
    return line.replace(/`[^`]*`/g, '');
  }

  const closing = new RegExp('^\\s{0,3}' + inFenceObj.char + '{' + inFenceObj.length + ',}\\s*$');
  if (closing.test(line)) {
    inFenceObj.value = false;
    inFenceObj.char = null;
    inFenceObj.length = 0;
  }
  return '';
}

export function checkKanji(rawText, data) {
  const lines = rawText.split(/\r?\n/);
  let inFenceObj = { value: false };
  const cleanedLines = [];
  
  for (const line of lines) {
    cleanedLines.push(stripCodeSpans(line, inFenceObj));
  }

  const outOfList = new Map();
  const simplifiedHits = new Map();
  const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

  for (let i = 0; i < cleanedLines.length; i++) {
    for (const { segment } of segmenter.segment(cleanedLines[i])) {
      if (/\p{Script=Han}/u.test(segment)) {
        if (data.simplifiedSet.has(segment) && !simplifiedHits.has(segment)) {
          simplifiedHits.set(segment, i + 1);
        }
        if (!data.joyoSet.has(segment) && !outOfList.has(segment)) {
          outOfList.set(segment, i + 1);
        }
      }
    }
  }

  const outLines = [];
  outLines.push("### 中国語簡体字の疑い");
  if (simplifiedHits.size === 0) {
    outLines.push("なし");
  } else {
    for (const [k, lineNum] of simplifiedHits.entries()) {
      outLines.push(`- ${k} (line ${lineNum}) — 日本語では使われない簡体字。コピー&ペースト元が中国語である可能性が高い`);
    }
  }

  outLines.push("### 常用漢字表外字");
  if (outOfList.size === 0) {
    outLines.push("なし");
  } else {
    for (const [k, lineNum] of outOfList.entries()) {
      const note = simplifiedHits.has(k) ? "（簡体字の疑いあり、上記参照）" : "固有名詞・専門用語なら許容、一般語なら常用漢字への置き換えを検討";
      outLines.push(`- ${k} (line ${lineNum}) — 表外字。${note}`);
    }
  }

  const cleanedText = cleanedLines.join('\n');
  outLines.push("### 表記ゆれ（漢字/かな混在）");
  let found = false;
  
  for (const pair of data.pairs) {
    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const kanjiCount = (cleanedText.match(new RegExp(escapeRegExp(pair.kanji), 'g')) || []).length;
    const kanaCount = (cleanedText.match(new RegExp(escapeRegExp(pair.kana), 'g')) || []).length;
    if (kanjiCount > 0 && kanaCount > 0) {
      found = true;
      outLines.push(`- 「${pair.kanji}」${kanjiCount} 件 / 「${pair.kana}」${kanaCount} 件 — 表記を統一`);
    }
  }
  
  if (!found) {
    outLines.push("なし");
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
    console.error("Usage: node check-kanji.mjs --path <file1> <file2> ...");
    process.exit(1);
  }

  let data;
  try {
    data = loadData();
  } catch (err) {
    console.error("Failed to load data:", err);
    process.exit(1);
  }

  for (const p of paths) {
    console.log(`## ${p}`);
    if (!fs.existsSync(p)) {
      console.log("ファイルが見つからない\n");
      continue;
    }
    const raw = fs.readFileSync(p, 'utf8');
    const outLines = checkKanji(raw, data);
    outLines.forEach(l => console.log(l));
  }
}
