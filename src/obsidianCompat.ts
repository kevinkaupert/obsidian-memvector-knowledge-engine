import { requestUrl as obsidianRequestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian";

/**
 * Same gap as RequestUrlParamCompat below, for `createEl`: the real
 * Obsidian runtime accepts an inline `style` string in DomElementInfo (used
 * throughout this plugin's views), but the bundled types don't declare it.
 * `DomElementInfo` itself is an ambient global (declared in obsidian.d.ts's
 * `declare global` block), not a module export - extend it directly, no
 * import. Cast literals passed to createEl with `as DomElementInfoCompat`.
 */
export interface DomElementInfoCompat extends DomElementInfo {
  style?: string;
}

/**
 * The `obsidian` npm package's bundled type definitions (v1.13.1) don't
 * declare `throwOnError`, even though the real Obsidian desktop app has
 * supported it on `requestUrl` for a while (used throughout this plugin to
 * read `response.status` on non-2xx responses instead of catching an
 * exception). One typed shim here instead of `as any` scattered at every
 * call site.
 */
export interface RequestUrlParamCompat extends RequestUrlParam {
  throwOnError?: boolean;
}

export function requestUrl(params: RequestUrlParamCompat): Promise<RequestUrlResponse> {
  return obsidianRequestUrl(params);
}
