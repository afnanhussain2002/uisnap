import { spawn } from "node:child_process";
import fs from "node:fs";

function run(cmd: string, args: string[], stdinFile?: string): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: [stdinFile ? "pipe" : "ignore", "ignore", "ignore"] });
    } catch {
      return resolve(false);
    }
    const timer = setTimeout(() => resolve(false), 10_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    if (stdinFile && child.stdin) fs.createReadStream(stdinFile).pipe(child.stdin);
  });
}

/** Copy a PNG to the clipboard using tools built into each OS. */
export async function copyImage(file: string): Promise<boolean> {
  if (process.platform === "win32") {
    const p = file.replace(/'/g, "''");
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      `$img = [System.Drawing.Image]::FromFile('${p}')`,
      "[System.Windows.Forms.Clipboard]::SetImage($img)",
      "$img.Dispose()",
    ].join("; ");
    return run("powershell", ["-NoProfile", "-STA", "-Command", script]);
  }
  if (process.platform === "darwin") {
    const p = file.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return run("osascript", ["-e", `set the clipboard to (read (POSIX file "${p}") as «class PNGf»)`]);
  }
  // Linux: Wayland first, then X11
  if (process.env.WAYLAND_DISPLAY && (await run("wl-copy", ["--type", "image/png"], file))) return true;
  return run("xclip", ["-selection", "clipboard", "-t", "image/png", "-i", file]);
}

/** Open a file with the default app (image viewer, browser). */
export function openFile(file: string): void {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", file]]
      : process.platform === "darwin"
        ? ["open", [file]]
        : ["xdg-open", [file]];
  try {
    spawn(cmd as string, args as string[], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // opening is a convenience, ignore failures
  }
}
