import { extractText, getDocumentProxy } from "unpdf";
import { parsePolizasPdf } from "./parser.js";

// Extrae texto de un buffer de PDF con unpdf (pdf.js serverless-friendly)
// y devuelve los registros de póliza encontrados.
export async function parsePdfBuffer(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const res = parsePolizasPdf(text);
  return { ...res, paginas: totalPages };
}
