import { TOKENS_CSS } from "./tokens.js";
import { BASE_CSS } from "./base.js";
import { COMPONENTS_CSS } from "./components.js";

/** Full stylesheet for the admin pages, inlined into every page. */
export const PAGE_CSS = TOKENS_CSS + BASE_CSS + COMPONENTS_CSS;
