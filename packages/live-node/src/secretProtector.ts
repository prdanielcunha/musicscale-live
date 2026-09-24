import { spawn } from 'node:child_process';

export interface SecretProtector {
  readonly kind: 'plaintext-alpha' | 'windows-dpapi';
  isProtected(value: string): boolean;
  protect(value: string, purpose: string): Promise<string>;
  unprotect(value: string, purpose: string): Promise<string>;
}

export class PlaintextAlphaSecretProtector implements SecretProtector {
  readonly kind = 'plaintext-alpha' as const;

  isProtected(): boolean {
    return false;
  }

  async protect(value: string): Promise<string> {
    return value;
  }

  async unprotect(value: string): Promise<string> {
    return value;
  }
}

const DPAPI_PREFIX = 'dpapi:v1:';

const DPAPI_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json",
  "$entropy = [Text.Encoding]::UTF8.GetBytes([string]$payload.purpose)",
  "if ([string]$payload.operation -eq 'protect') {",
  "  $plain = [Text.Encoding]::UTF8.GetBytes([string]$payload.value)",
  "  $cipher = [Security.Cryptography.ProtectedData]::Protect($plain, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "  [Console]::Out.Write([Convert]::ToBase64String($cipher))",
  "} elseif ([string]$payload.operation -eq 'unprotect') {",
  "  $cipher = [Convert]::FromBase64String([string]$payload.value)",
  "  $plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "  [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))",
  "} else {",
  "  throw 'invalid_dpapi_operation'",
  "}"
].join('; ');

function runPowerShell(payload: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        DPAPI_SCRIPT
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });

    child.on('error', error => reject(error));
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(
          stderr.trim()
            ? `windows_dpapi_failed: ${stderr.trim().slice(0, 500)}`
            : `windows_dpapi_failed: exit_${code}`
        ));
        return;
      }
      resolve(stdout);
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

export class WindowsDpapiSecretProtector implements SecretProtector {
  readonly kind = 'windows-dpapi' as const;

  isProtected(value: string): boolean {
    return value.startsWith(DPAPI_PREFIX);
  }

  async protect(value: string, purpose: string): Promise<string> {
    if (!value) return value;
    if (this.isProtected(value)) return value;

    const protectedValue = await runPowerShell({
      operation: 'protect',
      value,
      purpose
    });

    if (!protectedValue) throw new Error('windows_dpapi_empty_result');
    return `${DPAPI_PREFIX}${protectedValue}`;
  }

  async unprotect(value: string, purpose: string): Promise<string> {
    if (!value) return value;
    if (!this.isProtected(value)) return value;

    return runPowerShell({
      operation: 'unprotect',
      value: value.slice(DPAPI_PREFIX.length),
      purpose
    });
  }
}

export function createPlatformSecretProtector(
  platform: NodeJS.Platform = process.platform
): SecretProtector {
  if (platform === 'win32') return new WindowsDpapiSecretProtector();
  return new PlaintextAlphaSecretProtector();
}
