param(
  [string]$ProcessName = "designer",
  [string]$TitleMatch = "",
  [string]$OutFile = "",
  [switch]$List
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.Drawing

$code = @"
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
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

    static string Esc(string s) {
        if (s == null) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
    }

    public static string ListWindows() {
        StringBuilder sb = new StringBuilder();
        sb.Append("{\"ok\":true,\"windows\":[");
        bool first = true;
        foreach (var p in Process.GetProcesses()) {
            try {
                if (p.MainWindowHandle == IntPtr.Zero) continue;
                string title = p.MainWindowTitle;
                if (string.IsNullOrWhiteSpace(title)) continue;
                if (!first) sb.Append(",");
                first = false;
                sb.Append("{\"process\":\"").Append(Esc(p.ProcessName)).Append("\",\"title\":\"").Append(Esc(title)).Append("\"}");
            } catch { }
        }
        sb.Append("]}");
        return sb.ToString();
    }

    public static string Capture(string processName, string titleMatch, string outFile) {
        SetProcessDPIAware();
        Process proc = null;
        foreach (var p in Process.GetProcesses()) {
            try {
                if (p.MainWindowHandle == IntPtr.Zero) continue;
                if (!string.IsNullOrWhiteSpace(titleMatch)) {
                    if (p.MainWindowTitle != null && p.MainWindowTitle.IndexOf(titleMatch, StringComparison.OrdinalIgnoreCase) >= 0) { proc = p; break; }
                } else if (!string.IsNullOrWhiteSpace(processName)) {
                    if (string.Equals(p.ProcessName, processName, StringComparison.OrdinalIgnoreCase)) { proc = p; break; }
                }
            } catch { }
        }
        if (proc == null) {
            string target = !string.IsNullOrWhiteSpace(titleMatch) ? ("标题包含 \"" + titleMatch + "\"") : ("进程 " + processName);
            return "{\"ok\":false,\"error\":\"没有找到运行中的 " + Esc(target) + " 窗口\"}";
        }
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
        return "{\"ok\":true,\"path\":\"" + Esc(outFile) + "\",\"width\":" + w + ",\"height\":" + h +
               ",\"method\":\"" + method + "\",\"process\":\"" + Esc(proc.ProcessName) +
               "\",\"title\":\"" + Esc(proc.MainWindowTitle) + "\"}";
    }
}
"@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

if ($List) {
    [WindowCapture]::ListWindows()
    exit 0
}

if ([string]::IsNullOrWhiteSpace($OutFile)) {
    $dir = Join-Path $env:TEMP "omnidesigner-shots"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $OutFile = Join-Path $dir ("shot-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".png")
}
$parent = Split-Path -Parent $OutFile
if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

[WindowCapture]::Capture($ProcessName, $TitleMatch, $OutFile)
