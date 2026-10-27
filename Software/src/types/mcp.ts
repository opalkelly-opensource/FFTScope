/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Shape of window.FrontPanelAPI.mcp at runtime. getMCP() returns undefined when
 * MCP was not granted for this app.
 */
import type { WorkQueue } from "@opalkelly/frontpanel-platform-api";

export interface AppMCP {
    register(name: string, handler: (args: unknown) => Promise<unknown>): void;
    ready(): void;
    useWorkQueue(workQueue: WorkQueue): void;
}

export function getMCP(): AppMCP | undefined {
    return (window as unknown as { FrontPanelAPI?: { mcp?: AppMCP } }).FrontPanelAPI?.mcp;
}
