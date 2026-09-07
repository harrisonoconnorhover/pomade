function decode(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function encode(value: Uint8Array) {
  return btoa(String.fromCharCode(...value));
}
async function key(secret: string) {
  const bytes = decode(secret);
  if (bytes.length !== 32)
    throw new Error('The connection vault is not configured.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function sealCredentials(
  secret: string,
  account: string,
  provider: string,
  values: Record<string, string>,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(`${account}:${provider}`),
    },
    await key(secret),
    new TextEncoder().encode(JSON.stringify(values)),
  );
  return `v1.${encode(iv)}.${encode(new Uint8Array(cipher))}`;
}
export async function openCredentials(
  secret: string,
  account: string,
  provider: string,
  payload: string,
): Promise<Record<string, string>> {
  try {
    const [version, iv, cipher] = payload.split('.');
    if (version !== 'v1') throw new Error();
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decode(iv),
        additionalData: new TextEncoder().encode(`${account}:${provider}`),
      },
      await key(secret),
      decode(cipher),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error(
      'Saved connection could not be unlocked. Contact the site owner.',
    );
  }
}
