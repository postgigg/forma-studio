param([string]$OutputPath = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$source = Join-Path $projectRoot 'public\elements'
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot "release\Forma-Studio-Stickers-$($package.version).zip" }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $OutputPath) { throw "Archive already exists; use a new output path: $OutputPath" }
[IO.Directory]::CreateDirectory((Split-Path -Parent $OutputPath)) | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$files = @(Get-ChildItem -LiteralPath $source -File -Filter '*.png' | Sort-Object Name)
if ($files.Count -eq 0) { throw 'No sticker images found.' }
$originalBytes = ($files | Measure-Object Length -Sum).Sum
$archive = [IO.Compression.ZipFile]::Open($OutputPath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, ('elements/' + $file.Name), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  $entry = $archive.CreateEntry('READ-ME.txt')
  $writer = New-Object IO.StreamWriter($entry.Open())
  try { $writer.Write("Forma Studio sticker collection`r`n`r`nRight-click this ZIP in Windows and choose Extract All. The elements folder contains the original PNG files. Upload the images you want to use in a design.`r`n`r`nThese stickers are also included in the current desktop app's Elements library. This optional archive does not replace the app installer. Extracted images take their original disk space; delete this ZIP after extraction if you no longer need it.`r`n") } finally { $writer.Dispose() }
} finally { $archive.Dispose() }
# Read every archived image and compare its SHA-256 with the original, without extracting duplicate files.
$archive = [IO.Compression.ZipFile]::OpenRead($OutputPath)
$verified = 0
try {
  foreach ($file in $files) {
    $entry = $archive.GetEntry('elements/' + $file.Name)
    if (-not $entry -or $entry.Length -ne $file.Length) { throw "Invalid archived image: $($file.Name)" }
    $stream = $entry.Open()
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $actual = ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $hasher.Dispose() }
    $expected = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "Archived image hash mismatch: $($file.Name)" }
    $verified++
  }
} finally { $archive.Dispose() }
$zipBytes = (Get-Item -LiteralPath $OutputPath).Length
$proof = [ordered]@{ testedAt = [DateTime]::UtcNow.ToString('o'); version = $package.version; archive = [IO.Path]::GetFileName($OutputPath); files = $files.Count; originalsBytes = $originalBytes; zipBytes = $zipBytes; savedBytes = $originalBytes - $zipBytes; savingsPercent = [Math]::Round((1 - $zipBytes / $originalBytes) * 100, 3); verifiedImageHashes = $verified; zipSha256 = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant() }
$proof | ConvertTo-Json | Set-Content -LiteralPath ($OutputPath + '.proof.json') -Encoding UTF8
$proof | ConvertTo-Json
