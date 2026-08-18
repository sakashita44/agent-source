#Requires -Version 5.1
<#
verify-docs 用: 見出し・リスト階層の機械的検出。

抽出できるのは構造だけであり、対等性・抽象度の揃いといった意味判断は行わない。
本スクリプトはツリーと計数を出力し、意味判断はサブエージェントが担う。

検出内容:
  - 見出しツリー
  - 同一階層に並ぶ項目数（3 個以上で注意、5 個以上で要見直し）
  - 対等な節の下位構成の不一致（同一階層の兄弟が持つ子見出しの差）
#>
param(
    [Parameter(Mandatory = $true)]
    [string[]]$Path
)

$WARN_COUNT = 3
$REVIEW_COUNT = 5

function Remove-CodeFence {
    param([string[]]$Lines)
    $out = New-Object System.Collections.Generic.List[string]
    $fence = $null
    foreach ($line in $Lines) {
        if ($null -eq $fence) {
            if ($line -match '^\s*(`{3,}|~{3,})') {
                $fence = $matches[1].Substring(0, 1)
                $out.Add('')
                continue
            }
            $out.Add($line)
        }
        else {
            if ($line -match "^\s*($fence{3,})\s*$") { $fence = $null }
            $out.Add('')
        }
    }
    return $out
}

function Get-Headings {
    param([string[]]$Lines)
    $items = New-Object System.Collections.Generic.List[psobject]
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match '^(#{1,6})\s+(.+?)\s*$') {
            $items.Add([pscustomobject]@{
                    Level = $matches[1].Length
                    Text  = $matches[2]
                    Line  = $i + 1
                })
        }
    }
    return $items
}

function Get-ListBlocks {
    param([string[]]$Lines)
    # 連続するリスト行を 1 ブロックとし、ブロック内の最浅インデント項目を兄弟として数える
    $blocks = New-Object System.Collections.Generic.List[psobject]
    $current = $null
    $blank = 0
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $line = $Lines[$i]
        if ($line -match '^(\s*)([-*+]|\d+[.)])\s+\S') {
            $indent = $matches[1].Replace("`t", '    ').Length
            if ($null -eq $current) {
                $current = [pscustomobject]@{ Start = $i + 1; Indents = (New-Object System.Collections.Generic.List[int]) }
            }
            $current.Indents.Add($indent)
            $blank = 0
        }
        elseif ($line -match '^\s*$') {
            $blank++
            if ($blank -ge 2 -and $null -ne $current) { $blocks.Add($current); $current = $null }
        }
        elseif ($line -match '^\S') {
            if ($null -ne $current) { $blocks.Add($current); $current = $null }
        }
    }
    if ($null -ne $current) { $blocks.Add($current) }
    return $blocks
}

function Get-ParentText {
    param($Headings, [int]$Index)
    $level = $Headings[$Index].Level
    for ($j = $Index - 1; $j -ge 0; $j--) {
        if ($Headings[$j].Level -lt $level) { return $Headings[$j].Text }
    }
    return '(文書直下)'
}

foreach ($file in $Path) {
    if (-not (Test-Path $file)) {
        Write-Output "=== $file ==="
        Write-Output "  ファイルが見つからない"
        continue
    }

    $raw = Get-Content -Encoding UTF8 $file
    if ($null -eq $raw) { $raw = @() }
    $lines = Remove-CodeFence -Lines $raw
    $headings = Get-Headings -Lines $lines

    Write-Output "=== $file ==="

    if ($headings.Count -eq 0) {
        Write-Output "  見出しなし"
        Write-Output ""
        continue
    }

    Write-Output "[見出しツリー]"
    foreach ($h in $headings) {
        $indent = '  ' * ($h.Level - 1)
        Write-Output ("  {0}{1} {2}  (L{3})" -f $indent, ('#' * $h.Level), $h.Text, $h.Line)
    }
    Write-Output ""

    # --- 同一階層の項目数 ---
    $groups = @{}
    for ($i = 0; $i -lt $headings.Count; $i++) {
        $key = "$(Get-ParentText -Headings $headings -Index $i)`t$($headings[$i].Level)"
        if (-not $groups.ContainsKey($key)) { $groups[$key] = New-Object System.Collections.Generic.List[psobject] }
        $groups[$key].Add($headings[$i])
    }

    $countFindings = New-Object System.Collections.Generic.List[string]
    $listFindings = New-Object System.Collections.Generic.List[string]
    foreach ($key in $groups.Keys) {
        $n = $groups[$key].Count
        if ($n -lt $WARN_COUNT) { continue }
        $parts = $key -split "`t"
        $sev = if ($n -ge $REVIEW_COUNT) { '要見直し' } else { '注意' }
        $names = ($groups[$key] | ForEach-Object { $_.Text }) -join ' / '
        $countFindings.Add(("  [{0}] 「{1}」直下に H{2} が {3} 個: {4}" -f $sev, $parts[0], $parts[1], $n, $names))
    }

    foreach ($b in (Get-ListBlocks -Lines $lines)) {
        $min = ($b.Indents | Measure-Object -Minimum).Minimum
        $n = ($b.Indents | Where-Object { $_ -eq $min }).Count
        if ($n -ge $REVIEW_COUNT) {
            $listFindings.Add(("  [確認] L{0} 付近のリストに同一階層の項目が {1} 個" -f $b.Start, $n))
        }
    }

    Write-Output "[同一階層の見出し数]"
    if ($countFindings.Count -eq 0) { Write-Output "  なし" }
    else { $countFindings | ForEach-Object { Write-Output $_ } }
    Write-Output ""

    # --- 見出しレベルの飛び ---
    $skips = New-Object System.Collections.Generic.List[string]
    for ($i = 1; $i -lt $headings.Count; $i++) {
        $gap = $headings[$i].Level - $headings[$i - 1].Level
        if ($gap -ge 2) {
            $skips.Add(("  [要見直し] L{0} 「{1}」: H{2} の直後に H{3}（中間階層が欠落）" -f `
                        $headings[$i].Line, $headings[$i].Text, $headings[$i - 1].Level, $headings[$i].Level))
        }
    }

    Write-Output "[見出しレベルの飛び]"
    if ($skips.Count -eq 0) { Write-Output "  なし" }
    else { $skips | ForEach-Object { Write-Output $_ } }
    Write-Output ""

    Write-Output "[リストの項目数]"
    if ($listFindings.Count -eq 0) { Write-Output "  なし" }
    else {
        $listFindings | ForEach-Object { Write-Output $_ }
        Write-Output "  ※ 同種の語の列挙（用語定義・チェック項目・選択肢）は項目数が多くても分割を要さない"
    }
    Write-Output ""

    # --- 対等な節の下位構成の不一致 ---
    $mismatch = New-Object System.Collections.Generic.List[string]
    foreach ($key in $groups.Keys) {
        $siblings = $groups[$key]
        if ($siblings.Count -lt 2) { continue }

        $shapes = New-Object System.Collections.Generic.List[psobject]
        foreach ($s in $siblings) {
            $idx = $headings.IndexOf($s)
            $kids = New-Object System.Collections.Generic.List[string]
            for ($j = $idx + 1; $j -lt $headings.Count; $j++) {
                if ($headings[$j].Level -le $s.Level) { break }
                if ($headings[$j].Level -eq $s.Level + 1) { $kids.Add($headings[$j].Text) }
            }
            $shapes.Add([pscustomobject]@{ Name = $s.Text; Kids = $kids })
        }

        $withKids = @($shapes | Where-Object { $_.Kids.Count -gt 0 })
        if ($withKids.Count -lt 2) { continue }

        # 「実例: X」のようなラベル付き見出しは、コロン前の役割名で突き合わせる
        foreach ($s in $withKids) {
            $norm = New-Object System.Collections.Generic.List[string]
            foreach ($k in $s.Kids) { $norm.Add((($k -split '[:：]')[0]).Trim()) }
            $s | Add-Member -NotePropertyName Norm -NotePropertyValue $norm -Force
        }

        # 子構成が部分的に重なる兄弟のみ報告する。完全一致は並列が保たれた状態、
        # 完全に不一致なら対等な要素ではないため、いずれも構成の崩れを示さない
        $parts = $key -split "`t"
        for ($a = 0; $a -lt $withKids.Count; $a++) {
            for ($b = $a + 1; $b -lt $withKids.Count; $b++) {
                $x = $withKids[$a]; $y = $withKids[$b]
                $shared = @($x.Norm | Where-Object { $y.Norm -contains $_ }).Count
                if ($shared -eq 0) { continue }
                if ($shared -eq $x.Norm.Count -and $shared -eq $y.Norm.Count) { continue }
                $mismatch.Add(("  「{0}」直下の H{1}: 下位構成が部分的にしか一致しない" -f $parts[0], $parts[1]))
                $mismatch.Add(("      {0}: {1}" -f $x.Name, ($x.Kids -join ' / ')))
                $mismatch.Add(("      {0}: {1}" -f $y.Name, ($y.Kids -join ' / ')))
            }
        }
    }

    Write-Output "[対等な節の下位構成]"
    if ($mismatch.Count -eq 0) { Write-Output "  不一致なし" }
    else {
        $mismatch | ForEach-Object { Write-Output $_ }
        Write-Output "  ※ 対象の性質から生じた差（特定要素だけの補足、他要素に存在しない内容）は逸脱として正当。"
        Write-Output "     対等な要素かどうかと、差に理由があるかはサブエージェントが判断する"
    }
    Write-Output ""
}
