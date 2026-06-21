function requiresNodeRuntime(binPath: string): boolean {
  return binPath.endsWith('.js');
}

export function spawnTarget(binPath: string, args: string[]): { bin: string; args: string[] } {
  if (requiresNodeRuntime(binPath)) return { bin: process.execPath, args: [binPath, ...args] };
  return { bin: binPath, args };
}
