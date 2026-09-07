import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ambiguousLabels = ['ここ', 'こちら', 'here', 'click here', 'this link'];
const inlineLinkPattern = /(?<!\!)\[([^\]\r\n]+)\]\(([^)\r\n]+)\)/g;
const referenceLinkPattern = /(?<!\!)\[([^\]\r\n]+)\]\[([^\]\r\n]*)\]/g;
const definitionPattern = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)/;

export function isAmbiguousLabel(label) {
  const normalized = label.trim().toLowerCase();
  return ambiguousLabels.includes(normalized);
}

export function removeInlineCode(line) {
  return line.replace(/(?<!`)`+[^`\r\n]*?`+(?!`)/g, '');
}

export function getMarkdownLines(rawText) {
  const lines = rawText.split(/\r?\n/);
  const result = [];
  let inFence = false;
  let fenceCharacter = null;
  let fenceLength = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    
    if (!inFence) {
      const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (match) {
        inFence = true;
        fenceCharacter = match[1].charAt(0);
        fenceLength = match[1].length;
        continue;
      }
    } else {
      const closingPattern = new RegExp(`^\\s{0,3}${fenceCharacter}{${fenceLength},}\\s*$`);
      if (closingPattern.test(line)) {
        inFence = false;
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }

    result.push({
      number: index + 1,
      text: line
    });
  }
  return result;
}

export async function checkLinks(rawText, fetchFn = globalThis.fetch, { checkReachability = Boolean(fetchFn) } = {}) {
  const markdownLines = getMarkdownLines(rawText);
  const definitions = new Map();
  const findings = [];
  const reachabilityFindings = [];

  for (const item of markdownLines) {
    const match = item.text.match(definitionPattern);
    if (match) {
      definitions.set(match[1].trim().toLowerCase(), match[2]);
    }
  }

  const reachabilityChecks = [];

  for (const item of markdownLines) {
    if (definitionPattern.test(item.text)) continue;
    const text = removeInlineCode(item.text);

    let match;
    const inlineRegex = new RegExp(inlineLinkPattern);
    while ((match = inlineRegex.exec(text)) !== null) {
      const label = match[1];
      const destination = match[2].trim();
      if (isAmbiguousLabel(label)) {
        findings.push(`  [要見直し] L${item.number} 「${label.trim()}」 -> ${destination}`);
      }
      if (destination.startsWith('http://') || destination.startsWith('https://')) {
        reachabilityChecks.push({ line: item.number, label: label.trim(), url: destination });
      }
    }

    const refRegex = new RegExp(referenceLinkPattern);
    while ((match = refRegex.exec(text)) !== null) {
      const label = match[1];
      let reference = match[2].trim();
      if (!reference) reference = label.trim();
      const key = reference.toLowerCase();
      const destination = definitions.has(key) ? definitions.get(key) : "[" + reference + "]";
      if (isAmbiguousLabel(label)) {
        findings.push("  [要見直し] L" + item.number + " 「" + label.trim() + "」 -> " + destination);
      }
      
      if (destination.startsWith('http://') || destination.startsWith('https://')) {
        reachabilityChecks.push({ line: item.number, label: label.trim(), url: destination });
      }
    }
  }

  let networkErrors = 0;
  if (checkReachability && fetchFn) {
    for (const check of reachabilityChecks) {
      try {
        const res = await fetchFn(check.url, { method: "HEAD" });
        // HEADを拒否して405を返すサイトがあるため、405は到達不可として扱わない。
        if (!res.ok && res.status !== 405) {
          reachabilityFindings.push(`  [要見直し] L${check.line} 「${check.label}」 -> ${check.url} (到達不可: ${res.status})`);
        }
      } catch (err) {
        networkErrors += 1;
        reachabilityFindings.push(`  [確認不可] L${check.line} 「${check.label}」 -> ${check.url} (${err.message || "ネットワークエラー"})`);
      }
    }
  }

  const outLines = ["[曖昧なリンク文言]"];
  if (findings.length === 0) {
    outLines.push("  なし");
  } else {
    outLines.push(...findings);
  }

  if (checkReachability) {
    outLines.push("");
    outLines.push("[リンクの到達性]");
    if (reachabilityChecks.length === 0) {
      outLines.push("  対象のurlなし");
    } else if (networkErrors === reachabilityChecks.length) {
      // 全件が通信エラーのときは、リンク切れではなくネットワークを使えない環境とみなす。
      outLines.push(`  スキップ: ネットワークへ到達できない（対象 ${reachabilityChecks.length} 件）`);
    } else if (reachabilityFindings.length === 0) {
      outLines.push(`  ${reachabilityChecks.length} 件すべて到達可能`);
    } else {
      outLines.push(...reachabilityFindings);
    }
  }

  outLines.push("");
  return outLines;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let paths = [];
  const checkReachability = args.includes("--check-reachability");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path' && i + 1 < args.length) {
      paths.push(args[++i]);
    } else if (!args[i].startsWith('--')) {
      paths.push(args[i]);
    }
  }

  if (paths.length === 0) {
    console.error("Usage: node check-links.mjs --path <file1> <file2> ... [--check-reachability]");
    process.exit(1);
  }

  (async () => {
    for (const p of paths) {
      console.log(`=== ${p} ===`);
      if (!fs.existsSync(p)) {
        console.log("[曖昧なリンク文言]\n  ファイルが見つからない\n");
        continue;
      }
      const raw = fs.readFileSync(p, 'utf8');
      const outLines = await checkLinks(raw, globalThis.fetch, { checkReachability });
      outLines.forEach(l => console.log(l));
    }
  })();
}
