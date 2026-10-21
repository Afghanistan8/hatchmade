// Probe: replicate the console's read pipeline exactly.
import { createRequire } from "node:module";
const require = createRequire("C:/Users/emman/Documents/Hatchmade/web/package.json");
const g = require("genlayer-js");
const { CONTRACT_ADDRESS } = { CONTRACT_ADDRESS: "0x7a88389Bd7c340D48Dc1802Ac32Ea6b7E652133B" };

(async () => {
  const client = g.createClient({ chain: g.chains.studionet });
  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "list_cases",
      args: [0, 100],
    });
    console.log("RAW type:", raw?.constructor?.name);
    console.log(JSON.stringify(raw, (k, v) => v instanceof Map ? Object.fromEntries(v.entries()) : v, 1).slice(0, 800));
  } catch (e) {
    console.log("READ ERROR:", e?.name, e?.message, e?.details ?? "");
  }
  try {
    const raw2 = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_case",
      args: ["C1"],
    });
    console.log("get_case RAW type:", raw2?.constructor?.name, Object.prototype.toString.call(raw2));
    console.log(JSON.stringify(raw2, (k, v) => v instanceof Map ? Object.fromEntries(v.entries()) : v, 1).slice(0, 400));
  } catch (e) {
    console.log("get_case ERROR:", e?.name, e?.message);
  }
})();
