import crypto from "node:crypto";
import fs from "node:fs";

export function sha256(data: Uint8Array | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function sha256File(file: string): string {
  return sha256(fs.readFileSync(file));
}
