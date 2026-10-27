/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import type { IFPGADataPortAXILite } from "@opalkelly/frontpanel-platform-api";

/** datapath_ctrl register byte offsets (base 0x0000). */
const CSR = {
    CTRL: 0x00, // W1P [0]=arm (reads back 0)
    STATUS: 0x04, // R   [0]=capture_done, [6]=play_ready
    CONFIG: 0x08, // RW  [0]=dac_enable, [1]=path_sel
    READ_COUNT: 0x0c // R   [31:0]  (freq path: 1 header beat + 2048 bins = 2049)
} as const;

const CTRL_ARM = 1 << 0;

const STATUS_CAPTURE_DONE = 1 << 0; // time captured and (freq path) FFT done
const STATUS_PLAY_READY = 1 << 6; // playbuf.frame_loaded

const CONFIG_DAC_ENABLE = 1 << 0;
const CONFIG_PATH_SEL = 1 << 1;

/** Readback source selected by CONFIG.path_sel. */
export enum CapturePath {
    Time = 0,
    Freq = 1
}

export interface DatapathStatus {
    raw: number;
    captureDone: boolean;
    playReady: boolean;
}

export interface DatapathConfig {
    raw: number;
    dacEnable: boolean;
    pathSel: boolean;
}

/** datapath_ctrl at 0x0000: the control plane for both signal paths. */
export class DatapathCtrlDriver {
    private readonly _AxiLite: IFPGADataPortAXILite;

    constructor(axiLite: IFPGADataPortAXILite) {
        this._AxiLite = axiLite;
    }

    /**
     * Strobe CTRL.arm. One strobe captures the time frame and runs both forward
     * FFTs; path_sel only chooses which finished frame is drained afterwards.
     */
    public async Arm(): Promise<void> {
        // CTRL is write-1-pulse: writing a 1 fires a single-cycle strobe.
        await this.Write(CSR.CTRL, CTRL_ARM);
    }

    /**
     * Route the readback mux. The unselected source is back-pressured and holds
     * its frame.
     * @param path - Readback source to drain.
     */
    public async SelectPath(path: CapturePath): Promise<void> {
        await this.UpdateConfig(
            CONFIG_PATH_SEL,
            path === CapturePath.Freq ? CONFIG_PATH_SEL : 0
        );
    }

    /**
     * Gate the DAC playout path. This is a gate, not a trigger: playback is armed
     * by TLAST at the end of the streamed spectrum.
     * @param enabled - Desired state of CONFIG.dac_enable.
     */
    public async SetDacEnable(enabled: boolean): Promise<void> {
        await this.UpdateConfig(CONFIG_DAC_ENABLE, enabled ? CONFIG_DAC_ENABLE : 0);
    }

    /** STATUS.play_ready: playbuf holds a frame. */
    public async IsPlayReady(): Promise<boolean> {
        return ((await this.Read(CSR.STATUS)) & STATUS_PLAY_READY) !== 0;
    }

    /** READ_COUNT: 64-bit beats to drain for the selected path. */
    public async ReadCount(): Promise<number> {
        return this.Read(CSR.READ_COUNT);
    }

    /** Read and decode STATUS. */
    public async ReadStatus(): Promise<DatapathStatus> {
        const raw = await this.Read(CSR.STATUS);

        return {
            raw,
            captureDone: (raw & STATUS_CAPTURE_DONE) !== 0,
            playReady: (raw & STATUS_PLAY_READY) !== 0
        };
    }

    /** Read and decode CONFIG. */
    public async ReadConfig(): Promise<DatapathConfig> {
        const raw = await this.Read(CSR.CONFIG);

        return {
            raw,
            dacEnable: (raw & CONFIG_DAC_ENABLE) !== 0,
            pathSel: (raw & CONFIG_PATH_SEL) !== 0
        };
    }

    private async Read(offset: number): Promise<number> {
        return (await this._AxiLite.read(offset)) >>> 0;
    }

    private async Write(offset: number, value: number): Promise<void> {
        await this._AxiLite.write(offset, value >>> 0);
    }

    /**
     * Read-modify-write the bits of CONFIG named by `mask`. CONFIG holds two
     * independent bits, so a blind write of one would clear the other.
     * @param mask - Bits to change.
     * @param value - Desired values for those bits; bits outside `mask` are ignored.
     */
    private async UpdateConfig(mask: number, value: number): Promise<void> {
        const current = await this.Read(CSR.CONFIG);
        const next = ((current & ~mask) | (value & mask)) >>> 0;

        if (next !== current) {
            await this.Write(CSR.CONFIG, next);
        }
    }
}
