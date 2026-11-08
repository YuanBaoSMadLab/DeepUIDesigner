param(
  [string]$ProcessName = "designer",
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$code = @"
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;

public class WindowCapture {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

    public static string Capture(string processName, string outFile) {
        SetProcessDPIAware();
        Process proc = null;
        foreach (var p in Process.GetProcessesByName(processName)) {
            if (p.MainWindowHandle != IntPtr.Zero) { proc = p; break; }
        }
        if (proc == null) return "{\"ok\":false,\"error\":\"没有找到运行中的 " + processName + " 窗口\"}";
        IntPtr hwnd = proc.MainWindowHandle;
        if (IsIconic(hwnd)) ShowWindow(hwnd, 9);
        RECT r;
        if (!GetWindowRect(hwnd, out r)) return "{\"ok\":false,\"error\":\"读取窗口位置失败\"}";
        int w = Math.Max(1, r.Right - r.Left);
        int h = Math.Max(1, r.Bottom - r.Top);

        Bitmap bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        bool printed = false;
        using (Graphics g = Graphics.FromImage(bmp)) {
            IntPtr hdc = g.GetHdc();
            try { printed = PrintWindow(hwnd, hdc, 2); } finally { g.ReleaseHdc(hdc); }
        }

        bool blank = true;
        if (printed) {
            int stepX = Math.Max(1, w / 12);
            int stepY = Math.Max(1, h / 12);
            Color first = bmp.GetPixel(w / 2, h / 2);
            for (int y = stepY; y < h - stepY && blank; y += stepY) {
                for (int x = stepX; x < w - stepX; x += stepX) {
                    Color c = bmp.GetPixel(x, y);
                    if (Math.Abs(c.R - first.R) + Math.Abs(c.G - first.G) + Math.Abs(c.B - first.B) > 24) { blank = false; break; }
                }
            }
        }

        string method = "printwindow";
        if (!printed || blank) {
            SetForegroundWindow(hwnd);
            Thread.Sleep(350);
            using (Graphics g = Graphics.FromImage(bmp)) {
                g.CopyFromScreen(r.Left, r.Top, 0, 0, new Size(w, h));
            }
            method = "screen";
        }

        bmp.Save(outFile, ImageFormat.Png);
        bmp.Dispose();
        return "{\"ok\":true,\"path\":\"" + outFile.Replace("\\", "\\\\") + "\",\"width\":" + w + ",\"height\":" + h + ",\"method\":\"" + method + "\"}";
    }
}
"@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

if ([string]::IsNullOrWhiteSpace($OutFile)) {
    $dir = Join-Path $env:TEMP "omnidesigner-shots"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $OutFile = Join-Path $dir ("shot-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".png")
}
$parent = Split-Path -Parent $OutFile
if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

[WindowCapture]::Capture($ProcessName, $OutFile)
