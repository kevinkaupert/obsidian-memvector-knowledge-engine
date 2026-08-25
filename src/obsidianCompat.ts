import { requestUrl as obsidianRequestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian";

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
  return obsidianRequestUrl(params as RequestUrlParam);
}
