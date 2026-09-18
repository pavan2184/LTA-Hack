export interface CsvOptions {
  expectedHeader: readonly string[];
  maxRows?: number;
}

export class CsvError extends Error {}

/**
 * Parse one RFC 4180-style CSV document.
 *
 * Quoted commas, doubled quotes, CRLF/LF records and embedded newlines are
 * supported. The published schema is deliberately exact: missing, extra,
 * reordered or duplicate columns fail before domain values are interpreted.
 */
export function parseCsv(
  input: string,
  file: string,
  options: CsvOptions,
): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  const finishField = () => {
    record.push(field);
    field = "";
    afterQuote = false;
  };
  const finishRecord = () => {
    finishField();
    if (record.some((cell) => cell.length > 0)) records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (afterQuote && char !== "," && char !== "\r" && char !== "\n") {
      if (/\s/.test(char)) continue;
      throw new CsvError(`${file}: unexpected character after closing quote`);
    }
    if (char === '"') {
      if (field.trim().length > 0) {
        throw new CsvError(`${file}: quote inside an unquoted field`);
      }
      field = "";
      quoted = true;
    } else if (char === ",") {
      finishField();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      finishRecord();
    } else {
      field += char;
    }
  }
  if (quoted) throw new CsvError(`${file}: unterminated quoted field`);
  if (field.length > 0 || record.length > 0) finishRecord();
  if (records.length === 0) throw new CsvError(`${file}: empty`);

  const header = records[0].map((value) => value.trim());
  const duplicate = header.find((value, index) => header.indexOf(value) !== index);
  if (duplicate) throw new CsvError(`${file}: duplicate column ${duplicate}`);
  if (
    header.length !== options.expectedHeader.length ||
    header.some((value, index) => value !== options.expectedHeader[index])
  ) {
    throw new CsvError(
      `${file}: expected header ${options.expectedHeader.join(",")}; received ${header.join(",")}`,
    );
  }

  const data = records.slice(1);
  if (options.maxRows !== undefined && data.length > options.maxRows) {
    throw new CsvError(`${file}: ${data.length} rows exceeds the ${options.maxRows}-row limit`);
  }
  return data.map((cells, index) => {
    if (cells.length !== header.length) {
      throw new CsvError(
        `${file}: row ${index + 2} has ${cells.length} fields; expected ${header.length}`,
      );
    }
    return Object.fromEntries(header.map((key, cell) => [key, cells[cell].trim()]));
  });
}
