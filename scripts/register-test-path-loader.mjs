import { register } from "node:module";

register("./test-path-loader.mjs", new URL(".", import.meta.url));
