/** RED 자리표시: 구현 전. */
export interface ServerOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  [k: string]: unknown;
}
export interface RunningServer {
  port: number;
  token: string;
  pin: string | null;
  readOnly: boolean;
  address: string;
  url: string;
  close(): Promise<void>;
}
export async function startServer(_opts: ServerOptions): Promise<RunningServer> {
  throw new Error("구현 전");
}
export async function findRunning(_root: string, _env: Record<string, string | undefined>, _agent: () => string | null): Promise<{ url: string } | null> {
  throw new Error("구현 전");
}
