import { renderUnder } from "./DollarDots.js";

console.log("Successfully loaded modules. Global registry has length:", (globalThis.DollarDots ??= []).length);
