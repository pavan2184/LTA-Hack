/**
 * A minimal ZIP writer, stored (uncompressed) entries only.
 *
 * The submission deliverable is a ZIP of results, and the page that produces it
 * runs entirely in the judge's browser with no server to build the archive. A
 * library would do, but the whole archive here is a few hundred kilobytes of
 * CSV: compression buys nothing worth a dependency, and "stored" is the one
 * method every unzip implementation has supported since 1989.
 *
 * Entries are written in the order given and the timestamp is fixed, so the
 * same submission produces a byte-identical archive every time — the same
 * property the scheduler already holds for its own output, and the reason two
 * runs can be diffed at all.
 */

/** 1980-01-01 00:00, the earliest a DOS timestamp can express. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface Planned {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

class Writer {
  private readonly parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  /** Little-endian, which is the only byte order the format uses. */
  u16(value: number): void {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    this.push(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ]),
    );
  }

  concat(): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/**
 * Build a ZIP archive from a map of path to contents.
 *
 * A key containing `/` becomes a directory path inside the archive; no explicit
 * directory entries are written, which every extractor handles by creating the
 * parents it needs.
 */
export function zipArchive(files: Record<string, string | Uint8Array>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const entries: Planned[] = [];
  const body = new Writer();

  for (const [name, contents] of Object.entries(files)) {
    const data = typeof contents === "string" ? encoder.encode(contents) : contents;
    const nameBytes = encoder.encode(name);
    const entry: Planned = { nameBytes, data, crc: crc32(data), offset: body.length };
    entries.push(entry);

    body.u32(0x04034b50);
    body.u16(20); // version needed to extract
    body.u16(0); // flags
    body.u16(0); // method: stored
    body.u16(DOS_TIME);
    body.u16(DOS_DATE);
    body.u32(entry.crc);
    body.u32(data.length); // compressed size == uncompressed, stored
    body.u32(data.length);
    body.u16(nameBytes.length);
    body.u16(0); // extra field length
    body.push(nameBytes);
    body.push(data);
  }

  const directoryOffset = body.length;
  for (const entry of entries) {
    body.u32(0x02014b50);
    body.u16(20); // version made by
    body.u16(20); // version needed
    body.u16(0);
    body.u16(0);
    body.u16(DOS_TIME);
    body.u16(DOS_DATE);
    body.u32(entry.crc);
    body.u32(entry.data.length);
    body.u32(entry.data.length);
    body.u16(entry.nameBytes.length);
    body.u16(0); // extra
    body.u16(0); // comment
    body.u16(0); // disk number start
    body.u16(0); // internal attributes
    body.u32(0); // external attributes
    body.u32(entry.offset);
    body.push(entry.nameBytes);
  }
  const directorySize = body.length - directoryOffset;

  body.u32(0x06054b50);
  body.u16(0); // this disk
  body.u16(0); // disk holding the directory
  body.u16(entries.length);
  body.u16(entries.length);
  body.u32(directorySize);
  body.u32(directoryOffset);
  body.u16(0); // archive comment length

  return body.concat();
}
