import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

/** SHA-256 hex of the photo hashes sorted ascending and joined with '\n'; null when there are no photos. */
export async function manifestHash(photoHashes: string[]): Promise<string | null> {
  if (!photoHashes.length) return null;
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, [...photoHashes].sort().join('\n'));
}

/** The verification code printed in the PDF: the manifest hash's first 12 hex chars. */
export const verificationCode = (manifest: string) => manifest.slice(0, 12);
