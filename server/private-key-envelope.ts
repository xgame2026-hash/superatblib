import crypto from "node:crypto";

export const PRIVATE_KEY_ENVELOPE_ALGORITHM = "RSA-OAEP-256+AES-256-GCM";

/** Encrypts a private key for tx2 without ever placing plaintext in the envelope. */
export function encryptPrivateKeyEnvelope(privateKey: string, publicKeyPem: string): string {
  const plaintext = privateKey.trim();
  if (!plaintext) throw new Error("Private key is required.");
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const encryptedData = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      oaepHash: "sha256",
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    aesKey,
  );

  return JSON.stringify({
    v: 1,
    alg: PRIVATE_KEY_ENVELOPE_ALGORITHM,
    key: encryptedKey.toString("base64"),
    iv: iv.toString("base64"),
    data: Buffer.concat([encryptedData, tag]).toString("base64"),
  });
}
