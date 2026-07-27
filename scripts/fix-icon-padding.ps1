Add-Type -AssemblyName System.Drawing

$assetsDir = "c:\Users\ramba\Downloads\Vgrand Taskhub\Taskhub-mobile\assets"

# Background color matching app.json: #4f46e5 = RGB(79, 70, 229)
$bgColor = [System.Drawing.Color]::FromArgb(79, 70, 229)

function Add-Padding($srcPath, $outPath, $scale, $transparentBg) {
    $bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
    $size = $bmp.Width
    $new = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($new)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($transparentBg) {
        $g.Clear([System.Drawing.Color]::Transparent)
    } else {
        $g.Clear($bgColor)
    }

    $w = [int]($size * $scale)
    $h = [int]($size * $scale)
    $x = [int](($size - $w) / 2)
    $y = [int](($size - $h) / 2)
    $g.DrawImage($bmp, $x, $y, $w, $h)

    $tmpPath = $outPath + ".tmp.png"
    $new.Save($tmpPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $new.Dispose()
    $bmp.Dispose()
    $g.Dispose()
    [System.IO.File]::Copy($tmpPath, $outPath, $true)
    [System.IO.File]::Delete($tmpPath)
    Write-Output "Saved: $outPath (scale=$scale)"
}

# icon.png: iOS rounded square mask, safe zone ~80%
$iconPath = Join-Path $assetsDir "icon.png"
Add-Padding $iconPath $iconPath 0.80 $false

# adaptive-icon.png: Android circular mask, safe zone ~66%
$adaptivePath = Join-Path $assetsDir "adaptive-icon.png"
Add-Padding $adaptivePath $adaptivePath 0.66 $true

Write-Output "Done!"
