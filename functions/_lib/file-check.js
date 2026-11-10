/**
 * Checks that an uploaded file really is what its name says: a PDF, JPEG or PNG.
 * The extension alone can be faked by renaming a file, so the first bytes are checked too.
 */
const has = (b, sig, at = 0) => sig.every((v, i) => b[at + i] === v);

/** @param {string} name  @param {Uint8Array} bytes the file, or at least its first 1KB */
export function contentMatchesName(name, bytes) {
  const ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1];
  if (!ext || !bytes || bytes.length < 8) return false;
  switch (ext.toLowerCase()) {
    case 'png': return has(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpg':
    case 'jpeg': return has(bytes, [0xff, 0xd8, 0xff]);
    case 'pdf': { // "%PDF-" may be preceded by a little junk; readers accept it within the first 1KB
      const end = Math.min(bytes.length - 5, 1024);
      for (let i = 0; i <= end; i++) if (has(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d], i)) return true;
      return false;
    }
    default: return false;
  }
}

/** Same check for a File/Blob, reading only its first 1KB. */
export async function fileMatchesName(name, file) {
  return contentMatchesName(name, new Uint8Array(await file.slice(0, 1029).arrayBuffer()));
}
