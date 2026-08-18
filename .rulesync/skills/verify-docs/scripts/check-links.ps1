#Requires -Version 5.1
<#
verify-docs 用: Markdown リンクの曖昧な表示文言を検出する。

リンクの表示文字列全体が禁止語に一致する場合だけ報告する。
画像、自動リンク、リンク定義、コードフェンス、インラインコードは対象外とする。
#>
param(
    [Parameter(Mandatory = $true)]
    [string[]]$Path
)

$ambiguousLabels = @('ここ', 'こちら', 'here', 'click here', 'this link')
$inlineLinkPattern = '(?<!\!)\[(?<label>[^\]\r\n]+)\]\((?<destination>[^)\r\n]+)\)'
$referenceLinkPattern = '(?<!\!)\[(?<label>[^\]\r\n]+)\]\[(?<reference>[^\]\r\n]*)\]'
$definitionPattern = '^\s{0,3}\[(?<reference>[^\]]+)\]:\s*(?<destination>\S+)'

function Test-AmbiguousLabel {
    param([string]$Label)

    $normalized = $Label.Trim()
    foreach ($candidate in $ambiguousLabels) {
        if ([string]::Equals($normalized, $candidate, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }
    return $false
}

function Remove-InlineCode {
    param([string]$Line)

    return [regex]::Replace($Line, '(?<!`)`+[^`\r\n]*?`+(?!`)', '')
}

function Get-MarkdownLines {
    param([string]$FilePath)

    $result = New-Object System.Collections.Generic.List[psobject]
    $inFence = $false
    $fenceCharacter = $null
    $fenceLength = 0
    $lines = Get-Content -Encoding UTF8 -LiteralPath $FilePath

    for ($index = 0; $index -lt $lines.Count; $index++) {
        $line = $lines[$index]
        if (-not $inFence -and $line -match '^\s{0,3}(?<fence>`{3,}|~{3,})') {
            $inFence = $true
            $fenceCharacter = $matches.fence.Substring(0, 1)
            $fenceLength = $matches.fence.Length
            continue
        }
        if ($inFence) {
            $closingPattern = '^\s{0,3}' + [regex]::Escape($fenceCharacter) + '{' + $fenceLength + ',}\s*$'
            if ($line -match $closingPattern) {
                $inFence = $false
                $fenceCharacter = $null
                $fenceLength = 0
            }
            continue
        }

        $result.Add([pscustomobject]@{
                Number = $index + 1
                Text   = $line
            })
    }
    return $result
}

$targets = New-Object System.Collections.Generic.List[object]
$seen = @{}
foreach ($pathItem in $Path) {
    $matches = @(Get-ChildItem -Path $pathItem -File -ErrorAction SilentlyContinue)
    if ($matches.Count -eq 0) {
        $targets.Add([pscustomobject]@{ Path = $pathItem; Exists = $false })
        continue
    }
    foreach ($file in $matches) {
        if (-not $seen.ContainsKey($file.FullName)) {
            $seen[$file.FullName] = $true
            $targets.Add([pscustomobject]@{ Path = $file.FullName; Exists = $true })
        }
    }
}

foreach ($target in $targets) {
    Write-Output "=== $($target.Path) ==="
    Write-Output '[曖昧なリンク文言]'

    if (-not $target.Exists) {
        Write-Output '  ファイルが見つからない'
        Write-Output ''
        continue
    }

    $markdownLines = @(Get-MarkdownLines -FilePath $target.Path)
    $definitions = @{}
    foreach ($item in $markdownLines) {
        if ($item.Text -match $definitionPattern) {
            $definitions[$matches.reference.Trim().ToLowerInvariant()] = $matches.destination
        }
    }

    $findings = New-Object System.Collections.Generic.List[string]
    foreach ($item in $markdownLines) {
        if ($item.Text -match $definitionPattern) { continue }
        $text = Remove-InlineCode -Line $item.Text

        foreach ($match in [regex]::Matches($text, $inlineLinkPattern)) {
            $label = $match.Groups['label'].Value
            if (Test-AmbiguousLabel -Label $label) {
                $destination = $match.Groups['destination'].Value.Trim()
                $findings.Add(('  [要見直し] L{0} 「{1}」 -> {2}' -f $item.Number, $label.Trim(), $destination))
            }
        }

        foreach ($match in [regex]::Matches($text, $referenceLinkPattern)) {
            $label = $match.Groups['label'].Value
            if (-not (Test-AmbiguousLabel -Label $label)) { continue }
            $reference = $match.Groups['reference'].Value.Trim()
            if ([string]::IsNullOrWhiteSpace($reference)) { $reference = $label.Trim() }
            $key = $reference.ToLowerInvariant()
            $destination = if ($definitions.ContainsKey($key)) { $definitions[$key] } else { "[$reference]" }
            $findings.Add(('  [要見直し] L{0} 「{1}」 -> {2}' -f $item.Number, $label.Trim(), $destination))
        }
    }

    if ($findings.Count -eq 0) {
        Write-Output '  なし'
    }
    else {
        $findings | ForEach-Object { Write-Output $_ }
    }
    Write-Output ''
}
