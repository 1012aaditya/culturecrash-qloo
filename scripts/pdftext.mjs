import { readFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
const pdf = await getDocumentProxy(new Uint8Array(readFileSync(process.argv[2])));
const { totalPages, text } = await extractText(pdf, { mergePages: true });
console.log("pages", totalPages, "| chars", text.length);
console.log(text.slice(0, 900));
