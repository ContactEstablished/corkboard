# Downloads the Parakeet TDT 0.6B v3 (int8) speech model for sherpa-onnx into models\.
# Usage: scripts\download-models.ps1 [-ModelsDir <dir>]   (default: backend\models)
# Model license: CC-BY-4.0 (NVIDIA). See README.md. Needs tar.exe (built into Windows 10+).
param([string]$ModelsDir = (Join-Path $PSScriptRoot '..\models'))

$ErrorActionPreference = 'Stop'
$name = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8'
$url = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$name.tar.bz2"
$ModelsDir = [IO.Path]::GetFullPath($ModelsDir)
$target = Join-Path $ModelsDir 'parakeet-tdt-0.6b-v3-int8'
$files = 'encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'

function Test-Complete {
    foreach ($f in $files) {
        $path = Join-Path $target $f
        if (-not (Test-Path $path) -or (Get-Item $path).Length -eq 0) { return $false }
    }
    return $true
}

if (Test-Complete) {
    Write-Host "Model already present in $target"
    exit 0
}

New-Item -ItemType Directory -Force $ModelsDir | Out-Null
$archive = Join-Path $ModelsDir "$name.tar.bz2"
Write-Host "Downloading $url"
$ProgressPreference = 'SilentlyContinue' # the progress bar slows Invoke-WebRequest down a lot
Invoke-WebRequest -Uri $url -OutFile "$archive.part"
Move-Item -Force "$archive.part" $archive

Write-Host 'Extracting'
tar -xjf $archive -C $ModelsDir
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
New-Item -ItemType Directory -Force $target | Out-Null
foreach ($f in $files) { Move-Item -Force (Join-Path $ModelsDir "$name\$f") (Join-Path $target $f) }
Remove-Item -Recurse -Force (Join-Path $ModelsDir $name)
Remove-Item -Force $archive

if (-not (Test-Complete)) { throw 'Extraction did not produce the expected files' }
Write-Host "Model ready in $target"
