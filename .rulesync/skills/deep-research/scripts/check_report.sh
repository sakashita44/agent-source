#!/usr/bin/env bash
# report.md の機械検証: ソース数の下限と文中引用の有無を検査する
# 使い方: check_report.sh <report.md> <最低ソース数>
set -u

report="${1:?usage: check_report.sh <report.md> <min_sources>}"
min_sources="${2:?usage: check_report.sh <report.md> <min_sources>}"
fail=0

if [[ ! -f "$report" ]]; then
    echo "FAIL: $report が存在しない"
    exit 1
fi

# 検査 1: Sources セクションのユニーク URL 数 >= 最低ソース数
url_count=$(awk '/^## Sources/{f=1;next} /^## /{f=0} f' "$report" \
    | grep -oE 'https?://[^][)>"[:space:]]+' | sort -u | wc -l | tr -d ' ')
if (( url_count >= min_sources )); then
    echo "PASS: Sources のユニーク URL 数 ${url_count} (>= ${min_sources})"
else
    echo "FAIL: Sources のユニーク URL 数 ${url_count} (< ${min_sources})"
    fail=1
fi

# 検査 2: 本文各セクションに文中引用 (脚注 [^n] または http リンク) が 1 つ以上
# 除外: エグゼクティブサマリ / 結論と示唆 / 未解決の論点 / Sources
missing=$(awk '
    function excluded(s) {
        return s ~ /^(エグゼクティブサマリ|結論と示唆|未解決の論点|Sources)/
    }
    /^## / {
        if (sec != "" && !cited && !excluded(sec)) print sec
        sec = substr($0, 4); cited = 0
        next
    }
    /\[\^/ || /https?:\/\// { cited = 1 }
    END { if (sec != "" && !cited && !excluded(sec)) print sec }
' "$report")
if [[ -z "$missing" ]]; then
    echo "PASS: 全本文セクションに文中引用あり"
else
    while IFS= read -r sec; do
        echo "FAIL: セクション「${sec}」に文中引用がない"
    done <<< "$missing"
    fail=1
fi

if (( fail )); then
    echo "RESULT: FAIL"
    exit 1
fi
echo "RESULT: PASS"
