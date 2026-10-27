/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const POLL_INTERVAL_MS = 5;

/**
 * Await a hardware condition, checking immediately and then once per interval.
 * @param attempts - Total number of checks, including the immediate one.
 */
export async function pollUntil(
    predicate: () => Promise<boolean>,
    attempts: number,
    intervalMs: number = POLL_INTERVAL_MS
): Promise<boolean> {
    let satisfied = await predicate();

    for (let attempt = 1; attempt < attempts && !satisfied; attempt++) {
        await delay(intervalMs);
        satisfied = await predicate();
    }

    return satisfied;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
