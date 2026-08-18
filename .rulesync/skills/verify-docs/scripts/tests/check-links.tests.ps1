#Requires -Version 5.1
param()

$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'check-links.ps1'
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('verify-docs-check-links-' + [guid]::NewGuid().ToString('N'))
$failures = New-Object System.Collections.Generic.List[string]

function Assert-Contains {
    param([string]$Text, [string]$Expected, [string]$Name)
    if (-not $Text.Contains($Expected)) { $failures.Add("$Name`: expected '$Expected'") }
}

function Assert-NotContains {
    param([string]$Text, [string]$Unexpected, [string]$Name)
    if ($Text.Contains($Unexpected)) { $failures.Add("$Name`: unexpected '$Unexpected'") }
}

try {
    $null = New-Item -ItemType Directory -Path $temporaryRoot
    $detectionFile = Join-Path $temporaryRoot 'detection.md'
    $ignoredFile = Join-Path $temporaryRoot 'ignored.md'
    $cleanFile = Join-Path $temporaryRoot 'clean.md'

    @'
# 検出
[ここ](guide-ja.md)
[ こちら ](guide-space.md)
[HERE](guide-en.md)
[Click Here][click]
[this link][target]

[click]: click.md
[target]: target.md
'@ | Set-Content -Encoding UTF8 -LiteralPath $detectionFile

    @'
# 非検出
![ここ](image.png)
<https://example.com/here>
[here]: definition.md
`[here](inline-code.md)`
[詳細な設定](settings.md)
[リンク](links.md)

```markdown
[here](fenced-backtick.md)
```

~~~markdown
[こちら](fenced-tilde.md)
~~~
'@ | Set-Content -Encoding UTF8 -LiteralPath $ignoredFile

    '[デプロイ手順](deploy.md)' | Set-Content -Encoding UTF8 -LiteralPath $cleanFile

    $detectionOutput = (& $scriptPath -Path $detectionFile | Out-String)
    Assert-Contains $detectionOutput '[要見直し] L2 「ここ」 -> guide-ja.md' 'Japanese inline link'
    Assert-Contains $detectionOutput '[要見直し] L3 「こちら」 -> guide-space.md' 'Trimmed label'
    Assert-Contains $detectionOutput '[要見直し] L4 「HERE」 -> guide-en.md' 'Case-insensitive label'
    Assert-Contains $detectionOutput '[要見直し] L5 「Click Here」 -> click.md' 'English reference link'
    Assert-Contains $detectionOutput '[要見直し] L6 「this link」 -> target.md' 'Reference destination'

    $ignoredOutput = (& $scriptPath -Path $ignoredFile | Out-String)
    Assert-Contains $ignoredOutput '[曖昧なリンク文言]' 'Section heading'
    Assert-Contains $ignoredOutput '  なし' 'No findings'
    Assert-NotContains $ignoredOutput '[要見直し]' 'Excluded Markdown forms'

    $multipleOutput = (& $scriptPath -Path $detectionFile, $cleanFile | Out-String)
    Assert-Contains $multipleOutput "=== $detectionFile ===" 'First explicit file'
    Assert-Contains $multipleOutput "=== $cleanFile ===" 'Second explicit file'

    $globOutput = (& $scriptPath -Path (Join-Path $temporaryRoot '*.md') | Out-String)
    Assert-Contains $globOutput "=== $detectionFile ===" 'Glob detection file'
    Assert-Contains $globOutput "=== $ignoredFile ===" 'Glob ignored file'
    Assert-Contains $globOutput "=== $cleanFile ===" 'Glob clean file'

    $missingPath = Join-Path $temporaryRoot 'missing.md'
    $missingOutput = (& $scriptPath -Path $missingPath | Out-String)
    Assert-Contains $missingOutput "=== $missingPath ===" 'Missing path heading'
    Assert-Contains $missingOutput 'ファイルが見つからない' 'Missing path message'

    if ($failures.Count -gt 0) {
        $failures | ForEach-Object { Write-Error $_ }
        exit 1
    }
    Write-Output 'check-links.tests.ps1: PASS'
}
finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -Recurse -Force -LiteralPath $temporaryRoot
    }
}
