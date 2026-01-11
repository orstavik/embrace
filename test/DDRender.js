import * as DD from "./DD.js";
import { RenderOne } from "./DDRenderOne.js";

export function render(state, start, end, id) {
  return RenderOne(state, start, end, DD.getDefinition(id));
}

export const findRunnableTemplates = DD.findRunnableTemplates;