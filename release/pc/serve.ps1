# HyperStage local server for Windows (no install needed; uses built-in PowerShell).
# Serves the "app" folder next to this script at http://localhost:<port>/ and opens
# the default browser.  Supports HTTP Range requests so the song can be seeked.
param([int]$Port = 8765)

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'app'
if (-not (Test-Path (Join-Path $root 'index.html'))) {
    Write-Host "找不到 app\index.html，請先完整解壓縮 ZIP 再執行。" -ForegroundColor Red
    Read-Host '按 Enter 結束'
    exit 1
}

$mime = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
    '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'; '.fbx' = 'application/octet-stream'
    '.mp3' = 'audio/mpeg'; '.wav' = 'audio/wav'; '.ogg' = 'audio/ogg'; '.m4a' = 'audio/mp4'
    '.webp' = 'image/webp'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'
    '.ico' = 'image/x-icon'; '.lrc' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
    '.woff2' = 'font/woff2'; '.wasm' = 'application/wasm'
}

# Find a free port.
$listener = $null
for ($p = $Port; $p -lt $Port + 30; $p++) {
    try {
        $candidate = New-Object System.Net.HttpListener
        $candidate.Prefixes.Add("http://localhost:$p/")
        $candidate.Start()
        $listener = $candidate
        $Port = $p
        break
    } catch { }
}
if (-not $listener) {
    Write-Host '無法開啟本機連接埠，請關閉其他程式後再試。' -ForegroundColor Red
    Read-Host '按 Enter 結束'
    exit 1
}

$url = "http://localhost:$Port/"
Write-Host ''
Write-Host '  HyperStage 已啟動' -ForegroundColor Magenta
Write-Host "  網址：$url"
Write-Host '  關閉這個視窗即可停止。'
Write-Host ''
Start-Process $url

$rootFull = [System.IO.Path]::GetFullPath($root)

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    $stream = $null
    try {
        $path = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
        if ($path.EndsWith('/')) { $path += 'index.html' }
        $file = [System.IO.Path]::GetFullPath((Join-Path $rootFull ($path.TrimStart('/') -replace '/', '\')))

        # Refuse anything outside the app folder.
        if (-not $file.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $file -PathType Leaf)) {
            $response.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            continue
        }

        $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
        $response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $response.Headers['Accept-Ranges'] = 'bytes'
        $response.Headers['Cache-Control'] = 'no-cache'

        $stream = [System.IO.File]::OpenRead($file)
        $total = $stream.Length
        $start = 0
        $end = $total - 1

        $range = $request.Headers['Range']
        if ($range -and $range -match '^bytes=(\d*)-(\d*)$') {
            if ($Matches[1] -ne '') {
                $start = [int64]$Matches[1]
                if ($Matches[2] -ne '') { $end = [Math]::Min([int64]$Matches[2], $total - 1) }
            } elseif ($Matches[2] -ne '') {
                $start = [Math]::Max(0, $total - [int64]$Matches[2])
            }
            if ($start -gt $end -or $start -ge $total) {
                $response.StatusCode = 416
                $response.Headers['Content-Range'] = "bytes */$total"
                continue
            }
            $response.StatusCode = 206
            $response.Headers['Content-Range'] = "bytes $start-$end/$total"
        }

        $length = $end - $start + 1
        $response.ContentLength64 = $length
        if ($request.HttpMethod -eq 'HEAD') { continue }

        $stream.Seek($start, [System.IO.SeekOrigin]::Begin) | Out-Null
        $buffer = New-Object byte[] 262144
        $remaining = $length
        while ($remaining -gt 0) {
            $read = $stream.Read($buffer, 0, [int][Math]::Min($buffer.Length, $remaining))
            if ($read -le 0) { break }
            $response.OutputStream.Write($buffer, 0, $read)
            $remaining -= $read
        }
    } catch {
        # The browser often cancels media requests part-way; that is normal.
    } finally {
        if ($stream) { $stream.Dispose() }
        try { $response.Close() } catch { }
    }
}
