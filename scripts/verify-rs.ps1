# OmniDER Rust core verification script.
# Usage: powershell -File scripts\verify-rs.ps1 [-BaseUrl http://localhost:9528] [-IncludeChat]
# Smoke-tests each Rust backend feature; re-run after fixes. Failures keep the Node fallback in use.
param(
    [string]$BaseUrl = "http://localhost:9528",
    [switch]$IncludeChat
)

$ErrorActionPreference = "Stop"
$script:pass = 0
$script:fail = 0
function Check($name, [bool]$cond, $detail = "") {
    if ($cond) { $script:pass++; Write-Host "  [PASS] $name" -ForegroundColor Green }
    else { $script:fail++; Write-Host "  [FAIL] $name  $detail" -ForegroundColor Red }
}
function J($s) { try { $s | ConvertFrom-Json } catch { $null } }

Write-Host "===== OmniDER Rust core verification @ $BaseUrl =====" -ForegroundColor Cyan

# ---- 1. Static UI ----
Write-Host "[1] Static page" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing -TimeoutSec 5
    Check "GET / returns index.html" ($r.StatusCode -eq 200 -and $r.Content -match "OmniDER AI")
    $r2 = Invoke-WebRequest -Uri "$BaseUrl/qwebchannel.js" -UseBasicParsing -TimeoutSec 5
    Check "GET /qwebchannel.js" ($r2.StatusCode -eq 200)
} catch { Check "static page" $false $_.Exception.Message }

# ---- 2. Settings ----
Write-Host "[2] /api/settings" -ForegroundColor Yellow
try {
    $s = J (Invoke-WebRequest -Uri "$BaseUrl/api/settings" -UseBasicParsing -TimeoutSec 5).Content
    Check "returns apiKey/model/baseURL" ($s.apiKey -and $s.model -and $s.baseURL) "model=$($s.model)"
    Check "availableModels has deepseek-v4-flash" ($s.availableModels.value -contains "deepseek-v4-flash")
} catch { Check "/api/settings" $false $_.Exception.Message }

# ---- 3. Suggestions ----
Write-Host "[3] /api/suggestions" -ForegroundColor Yellow
try {
    $s = J (Invoke-WebRequest -Uri "$BaseUrl/api/suggestions" -UseBasicParsing -TimeoutSec 5).Content
    Check "no content -> 4 static items" ($s.Count -eq 4) "count=$($s.Count)"
    Check "no emoji field in suggestions" (-not (($s | ConvertTo-Json -Compress) -match '"emoji"'))
} catch { Check "/api/suggestions" $false $_.Exception.Message }

# ---- 4. UI state ----
Write-Host "[4] /api/ui" -ForegroundColor Yellow
try {
    $st = J (Invoke-WebRequest -Uri "$BaseUrl/api/ui/state" -UseBasicParsing -TimeoutSec 5).Content
    Check "state initial fields" ($null -ne $st.uiFilePath -and $null -ne $st.uiContent)
    $body = @{ uiFilePath = "C:\test.ui"; selectedElement = "<widget class=`"QPushButton`" name=`"btn`" />" } | ConvertTo-Json
    $u = J (Invoke-WebRequest -Uri "$BaseUrl/api/ui/update" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 5).Content
    Check "update returns ok" ($u.ok -eq $true)
    $st2 = J (Invoke-WebRequest -Uri "$BaseUrl/api/ui/state" -UseBasicParsing -TimeoutSec 5).Content
    Check "state reflects update" ($st2.uiFilePath -eq "C:\test.ui")
} catch { Check "/api/ui" $false $_.Exception.Message }

# ---- 5. Backup / revert flow ----
Write-Host "[5] Backup & revert (apply routes)" -ForegroundColor Yellow
$tmpUi = "$env:TEMP\omni_verify.ui"
@'
<?xml version="1.0" encoding="UTF-8"?>
<ui version="4.0">
 <class>Form</class>
 <widget class="QWidget" name="Form">
  <property name="geometry">
   <rect><x>0</x><y>0</y><width>400</width><height>300</height></rect>
  </property>
  <widget class="QPushButton" name="btn1">
   <property name="text"><string>Hello</string></property>
  </widget>
 </widget>
</ui>
'@ | Set-Content $tmpUi -Encoding UTF8
try {
    $b = J (Invoke-WebRequest -Uri "$BaseUrl/api/chat/backup" -Method POST -Body (@{ uiFilePath = $tmpUi } | ConvertTo-Json) -ContentType "application/json" -UseBasicParsing -TimeoutSec 5).Content
    Check "backup created" ($b.ok -eq $true)
    Set-Content $tmpUi "<?xml version=`"1.0`"?><ui version=`"4.0`"><widget class=`"QWidget`" name=`"Form`"/></ui>" -Encoding UTF8
    $rv = J (Invoke-WebRequest -Uri "$BaseUrl/api/chat/revert" -Method POST -Body (@{ uiFilePath = $tmpUi; level = 0 } | ConvertTo-Json) -ContentType "application/json" -UseBasicParsing -TimeoutSec 5).Content
    Check "revert ok" ($rv.ok -eq $true)
    $content = Get-Content $tmpUi -Raw
    Check "reverted content has Hello" ($content -match "Hello")
    $lst = J (Invoke-WebRequest -Uri "$BaseUrl/api/chat/backups?path=$([uri]::EscapeDataString($tmpUi))" -UseBasicParsing -TimeoutSec 5).Content
    Check "backups list" ($lst.backups.Count -ge 1) "count=$($lst.backups.Count)"
    $pre = J (Invoke-WebRequest -Uri "$BaseUrl/api/chat/has-prechat?path=$([uri]::EscapeDataString($tmpUi))" -UseBasicParsing -TimeoutSec 5).Content
    Check "has-prechat" ($null -ne $pre.exists)
} catch { Check "backup flow" $false $_.Exception.Message }
Remove-Item $tmpUi -Force -ErrorAction SilentlyContinue
Get-ChildItem "$env:TEMP\omni_verify.ui.omniback*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# ---- 6. Export ----
Write-Host "[6] /api/export" -ForegroundColor Yellow
try {
    $e = J (Invoke-WebRequest -Uri "$BaseUrl/api/export" -Method POST -Body (@{ content = "<ui version=`"4.0`"><widget class=`"QWidget`" name=`"Form`"/></ui>"; format = "ui" } | ConvertTo-Json) -ContentType "application/json" -UseBasicParsing -TimeoutSec 10).Content
    Check "export ui format" ($e.ok -eq $true -and $e.result -match "<ui")
    try {
        Invoke-WebRequest -Uri "$BaseUrl/api/export" -Method POST -Body (@{ content = "<ui version=`"4.0`"><widget class=`"QWidget`" name=`"Form`"/></ui>"; format = "bad" } | ConvertTo-Json) -ContentType "application/json" -UseBasicParsing -TimeoutSec 10 | Out-Null
        Check "export invalid format errors" $false "expected 400"
    } catch { Check "export invalid format errors" ($_.Exception.Response.StatusCode.value__ -eq 400) "got $($_.Exception.Response.StatusCode.value__)" }
} catch { Check "/api/export" $false $_.Exception.Message }

# ---- 7. Clear ----
Write-Host "[7] /api/chat/clear" -ForegroundColor Yellow
try {
    $c = J (Invoke-WebRequest -Uri "$BaseUrl/api/chat/clear" -Method POST -Body "{}" -ContentType "application/json" -UseBasicParsing -TimeoutSec 5).Content
    Check "clear returns ok" ($c.ok -eq $true)
} catch { Check "/api/chat/clear" $false $_.Exception.Message }

# ---- 8. Real chat (SSE) ----
if ($IncludeChat) {
    Write-Host "[8] /api/chat SSE streaming (real DeepSeek V4 call)" -ForegroundColor Yellow
    $chatUi = "$env:TEMP\omni_verify_chat.ui"
    @'
<?xml version="1.0" encoding="UTF-8"?>
<ui version="4.0">
 <class>Form</class>
 <widget class="QWidget" name="Form">
  <widget class="QPushButton" name="btn1">
   <property name="text"><string>Hi</string></property>
  </widget>
 </widget>
</ui>
'@ | Set-Content $chatUi -Encoding UTF8
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/api/chat" -Method POST -Body (@{
            message = "Read the file $chatUi then change the button text to Hello World"
            context = @{ uiFilePath = $chatUi; uiContent = ""; selectedElement = "" }
        } | ConvertTo-Json -Depth 4) -ContentType "application/json" -UseBasicParsing -TimeoutSec 120
        $data = ($resp.Content -split "`n") | Where-Object { $_ -like "data: *" } | ForEach-Object { $_.Substring(6) } | Where-Object { $_ -ne "[DONE]" }
        Check "SSE events received" ($data.Count -gt 0) "events=$($data.Count)"
        Check "contains done event" ([bool]($data -match '"type":"done"'))
        Check "contains thinking status" ([bool]($data -match '"type":"status"'))
        Check "contains tool event" ([bool]($data -match '"type":"tool"'))
        $txt = (Get-Content $chatUi -Raw)
        Check "button text changed to Hello World" ($txt -match "Hello World")
    } catch { Check "/api/chat" $false $_.Exception.Message }
    Remove-Item $chatUi -Force -ErrorAction SilentlyContinue
    Get-ChildItem "$env:TEMP\omni_verify_chat.ui.omniback*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "[8] skipped (add -IncludeChat to enable, consumes API quota)" -ForegroundColor DarkGray
}

Write-Host "===== Result: PASS=$script:pass FAIL=$script:fail =====" -ForegroundColor Cyan
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
