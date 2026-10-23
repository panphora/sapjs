// Every optional pass feature, in the order the pass runs them. The full entry
// registers this list; the core entry registers none of it.

import { registerFeature } from "../pass.js";
import { detailFeature } from "./detail.js";
import { calcFeature } from "./calc.js";
import { eachFeature } from "./each.js";
import { effectFeature } from "./effect.js";
import { validationFeature } from "./validation.js";
import { projectionFeature } from "./projection.js";

export function registerFullFeatures() {
  for (const f of [detailFeature, calcFeature, eachFeature, effectFeature, validationFeature, projectionFeature]) registerFeature(f);
}
