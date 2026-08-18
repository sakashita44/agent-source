# report.md の機械検証: ソース数の下限と文中引用の有無を検査する
# 使い方: check_report.ps1 -Report <report.md> -MinSources <最低ソース数>
param(
    [Parameter(Mandatory)][string]$Report,
    [Parameter(Mandatory)][int]$MinSources
)

$fail = $false

if (-not (Test-Path $Report)) {
    Write-Output "FAIL: $Report が存在しない"
    exit 1
}
$lines = Get-Content $Report -Encoding utf8

# 検査 1: Sources セクションのユニーク URL 数 >= 最低ソース数
$inSources = $false
$urls = [System.Collections.Generic.HashSet[string]]::new()
foreach ($line in $lines) {
    if ($line -match '^## Sources') { $inSources = $true; continue }
    elseif ($line -match '^## ') { $inSources = $false }
    if ($inSources) {
        foreach ($m in [regex]::Matches($line, 'https?://[^\s)>"\]]+')) {
            [void]$urls.Add($m.Value)
        }
    }
}
if ($urls.Count -ge $MinSources) {
    Write-Output "PASS: Sources のユニーク URL 数 $($urls.Count) (>= $MinSources)"
} else {
    Write-Output "FAIL: Sources のユニーク URL 数 $($urls.Count) (< $MinSources)"
    $fail = $true
}

# 検査 2: 本文各セクションに文中引用 (脚注 [^n] または http リンク) が 1 つ以上
# 除外: エグゼクティブサマリ / 結論と示唆 / 未解決の論点 / Sources
$excludePattern = '^(エグゼクティブサマリ|結論と示唆|未解決の論点|Sources)'
$sections = [ordered]@{}
$current = $null
foreach ($line in $lines) {
    if ($line -match '^## (.+)$') {
        $current = $Matches[1]
        if (-not $sections.Contains($current)) { $sections[$current] = $false }
    } elseif ($null -ne $current) {
        if ($line -match '\[\^' -or $line -match 'https?://') { $sections[$current] = $true }
    }
}
$missing = @($sections.Keys | Where-Object { $_ -notmatch $excludePattern -and -not $sections[$_] })
if ($missing.Count -eq 0) {
    Write-Output "PASS: 全本文セクションに文中引用あり"
} else {
    foreach ($sec in $missing) {
        Write-Output "FAIL: セクション「$sec」に文中引用がない"
    }
    $fail = $true
}

if ($fail) {
    Write-Output "RESULT: FAIL"
    exit 1
}
Write-Output "RESULT: PASS"
