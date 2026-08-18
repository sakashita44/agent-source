#Requires -Version 5.1
<#
verify-docs 用: 常用漢字表外字・簡体字混入・表記ゆれ（同一文書内の漢字/かな混在）の機械的検出。
文字コード（Unicode の漢字レンジ）とデータ照合のみで判定するため、LLM の意味判断を介さない。
#>
param(
    [Parameter(Mandatory = $true)]
    [string[]]$Path
)

function Read-CharSet {
    param([string]$FilePath)
    $text = Get-Content -Raw -Encoding UTF8 $FilePath
    $set = [System.Collections.Generic.HashSet[string]]::new()
    $enum = [System.Globalization.StringInfo]::GetTextElementEnumerator($text)
    while ($enum.MoveNext()) {
        $null = $set.Add($enum.GetTextElement())
    }
    return $set
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path (Split-Path -Parent $scriptDir) "data"

$joyoSet = Read-CharSet (Join-Path $dataDir "joyo-kanji.txt")
# 常用漢字（日本語字体）と重複しない、真に異なる簡体字のみ（OpenCC STCharacters.txt 由来）
$simplifiedSet = Read-CharSet (Join-Path $dataDir "simplified-chinese.txt")

$pairs = Get-Content -Encoding UTF8 (Join-Path $dataDir "hyoki-yure.tsv") |
    Where-Object { $_ -and -not $_.StartsWith("#") } |
    ForEach-Object {
        $cols = $_ -split "`t"
        [PSCustomObject]@{ Kanji = $cols[0]; Kana = $cols[1] }
    }

function Strip-CodeSpans {
    param([string]$Line, [ref]$InFence)
    if ($Line -match '^\s*```') {
        $InFence.Value = -not $InFence.Value
        return ""
    }
    if ($InFence.Value) { return "" }
    return ($Line -replace '`[^`]*`', '')
}

$targetFiles = @()
foreach ($p in $Path) {
    $targetFiles += Get-ChildItem -Path $p -File -ErrorAction SilentlyContinue
}
if ($targetFiles.Count -eq 0) {
    $targetFiles = $Path | ForEach-Object { Get-Item -Path $_ -ErrorAction SilentlyContinue }
}

foreach ($file in $targetFiles) {
    Write-Output "## $($file.FullName)"

    $lines = Get-Content -Encoding UTF8 -Path $file.FullName
    $inFence = $false
    $cleanedLines = @()
    foreach ($line in $lines) {
        $cleanedLines += Strip-CodeSpans -Line $line -InFence ([ref]$inFence)
    }

    # 常用漢字表外字・簡体字混入
    $outOfList = @{}
    $simplifiedHits = @{}
    for ($i = 0; $i -lt $cleanedLines.Count; $i++) {
        $lineEnum = [System.Globalization.StringInfo]::GetTextElementEnumerator($cleanedLines[$i])
        while ($lineEnum.MoveNext()) {
            $ch = $lineEnum.GetTextElement()
            if ($ch.Length -ge 1 -and [System.Text.RegularExpressions.Regex]::IsMatch($ch, '\p{IsCJKUnifiedIdeographs}')) {
                if ($simplifiedSet.Contains($ch) -and -not $simplifiedHits.ContainsKey($ch)) {
                    $simplifiedHits[$ch] = $i + 1
                }
                if (-not $joyoSet.Contains($ch) -and -not $outOfList.ContainsKey($ch)) {
                    $outOfList[$ch] = $i + 1
                }
            }
        }
    }

    Write-Output "### 中国語簡体字の疑い"
    if ($simplifiedHits.Count -eq 0) {
        Write-Output "なし"
    } else {
        foreach ($k in $simplifiedHits.Keys) {
            Write-Output "- $k (line $($simplifiedHits[$k])) — 日本語では使われない簡体字。コピー&ペースト元が中国語である可能性が高い"
        }
    }

    Write-Output "### 常用漢字表外字"
    if ($outOfList.Count -eq 0) {
        Write-Output "なし"
    } else {
        foreach ($k in $outOfList.Keys) {
            $note = if ($simplifiedHits.ContainsKey($k)) { "（簡体字の疑いあり、上記参照）" } else { "固有名詞・専門用語なら許容、一般語なら常用漢字への置き換えを検討" }
            Write-Output "- $k (line $($outOfList[$k])) — 表外字。$note"
        }
    }

    # 表記ゆれ（漢字形とかな形の同一文書内混在）
    $cleanedText = [string]::Join("`n", $cleanedLines)
    Write-Output "### 表記ゆれ（漢字/かな混在）"
    $found = $false
    foreach ($pair in $pairs) {
        $kanjiCount = ([System.Text.RegularExpressions.Regex]::Matches($cleanedText, [regex]::Escape($pair.Kanji))).Count
        $kanaCount = ([System.Text.RegularExpressions.Regex]::Matches($cleanedText, [regex]::Escape($pair.Kana))).Count
        if ($kanjiCount -gt 0 -and $kanaCount -gt 0) {
            $found = $true
            Write-Output "- 「$($pair.Kanji)」$kanjiCount 件 / 「$($pair.Kana)」$kanaCount 件 — 表記を統一"
        }
    }
    if (-not $found) {
        Write-Output "なし"
    }
    Write-Output ""
}
