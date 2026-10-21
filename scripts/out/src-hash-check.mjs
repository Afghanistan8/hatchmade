// Temporary: compare the deployed code blob to the local source.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const raw = readFileSync("C:/Users/emman/AppData/Local/Temp/hm_code.txt", "utf8");
const pin = '# { "Depends": "py-genlayer:';
const start = raw.indexOf(pin);
const blob = (start >= 0 ? raw.slice(start) : raw).replace(/\r\n/g, "\n");
const src = readFileSync("contracts/hatchmade.py", "utf8").replace(/\r\n/g, "\n");

const blobN = blob.replace(/\s+$/, "");
const srcN = src.replace(/\s+$/, "");
console.log("deployed (trimmed) sha256:", createHash("sha256").update(Buffer.from(blobN, "utf8")).digest("hex"));
console.log("local source sha256     :", createHash("sha256").update(Buffer.from(srcN, "utf8")).digest("hex"));
console.log("byte-identical (modulo trailing whitespace):", blobN === srcN);
