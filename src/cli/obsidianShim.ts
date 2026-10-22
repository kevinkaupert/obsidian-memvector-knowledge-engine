/**
 * Purpose: The two Obsidian functions the CLI bundle reaches through shared modules (`stringifyYaml`, `parseYaml` in
 * frontmatterYaml.ts), backed by the `yaml` package. The CLI build aliases `obsidian` to this file; the plugin bundle
 * keeps Obsidian's own functions.
 */
import { parse, stringify } from "yaml";

export function stringifyYaml(value: unknown): string {
  return stringify(value);
}

export function parseYaml(text: string): unknown {
  return parse(text);
}
