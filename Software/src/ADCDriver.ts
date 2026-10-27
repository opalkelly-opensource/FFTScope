/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IFPGADataPortAXILite } from "@opalkelly/frontpanel-platform-api";

import { SubEvent } from "sub-events";

import { pollUntil, POLL_INTERVAL_MS } from "./poll";

/** syzygy_adc register byte offsets (base 0x2000). */
const ADC_CSR = {
    CTRL: 0x2000, // W
    STATUS: 0x2004 // R
} as const;

const CTRL_REALIGN = 1 << 0; // write-1-pulse
const CTRL_STREAM_ENABLE = 1 << 2; // persistent; defaults to 1 out of reset
const CTRL_CLEAR_FLAGS = 1 << 8; // write-1-pulse; clears the sticky flags below

const STATUS_READY = 1 << 0; // deserializer locked
const STATUS_CAPTURE_CLK_ALIVE = 1 << 1; // the ADC DCO is toggling
const STATUS_ALIGN_DONE = 1 << 2;
const STATUS_ALIGN_FAIL = 1 << 3;
const STATUS_FIFO_OVERFLOW = 1 << 4; // sticky
const STATUS_FRAME_ERROR = 1 << 7; // sticky
const STATUS_OVERRIDE_ACTIVE = 1 << 8; // TAP_CTRL override holds the delay tap
const STATUS_TRACK_BUSY = 1 << 9; // a dynamic-tracking cycle is probing the eye
const STATUS_ALIGN_CONTINUOUS = 1 << 10; // constant: the ALIGN_MODE parameter

/** The deserializer re-locks in well under 500 ms after a realign. */
const ADC_READY_POLL_ATTEMPTS = 100;

export enum ADCState {
    Initial,
    ResetPending,
    ResetComplete,
    ResetFailed
}

export interface ADCStateChangeEventArgs {
    sender: ADCDriver;
    newState: ADCState;
    previousState: ADCState;
}

/** Decoded syzygy_adc STATUS. fifoOverflow and frameError are sticky. */
export interface ADCStatus {
    raw: number;
    ready: boolean;
    captureClkAlive: boolean;
    alignDone: boolean;
    alignFail: boolean;
    fifoOverflow: boolean;
    frameError: boolean;
    overrideActive: boolean;
    trackBusy: boolean;
    alignContinuous: boolean;
}

/** syzygy_adc CSR at 0x2000: pod bring-up and pod health. */
export class ADCDriver {
    private _State: ADCState = ADCState.Initial;

    private readonly _StateChangedEvent: SubEvent<ADCStateChangeEventArgs> =
        new SubEvent<ADCStateChangeEventArgs>();

    private readonly _AxiLite: IFPGADataPortAXILite;

    public get State() {
        return this._State;
    }

    public get StateChangedEvent() {
        return this._StateChangedEvent;
    }

    /**
     * @param axiLite - Native AXI-Lite port.
     */
    constructor(axiLite: IFPGADataPortAXILite) {
        this._AxiLite = axiLite;
    }

    /**
     * Re-sequence the ADC and wait for the deserializer to lock (STATUS.adc_ready).
     * @returns False if a reset is already in flight, or the lock never asserted.
     */
    public async Reset(): Promise<boolean> {
        if (this._State === ADCState.ResetPending) {
            return false;
        }

        console.log("ADC::Reset Pending...");
        this.UpdateState(ADCState.ResetPending);

        // Read-modify-write: preserves the persistent stream_enable[2] bit, which
        // a blind write of the pulse bits would zero (stopping the ADC stream).
        const ctrl = await this.Read(ADC_CSR.CTRL);
        await this.Write(
            ADC_CSR.CTRL,
            (ctrl & CTRL_STREAM_ENABLE) | CTRL_REALIGN | CTRL_CLEAR_FLAGS
        );

        const isReady = await pollUntil(
            () => this.IsReady(),
            ADC_READY_POLL_ATTEMPTS,
            POLL_INTERVAL_MS
        );

        if (isReady) {
            this.UpdateState(ADCState.ResetComplete);
            console.log("ADC::Reset Complete.");
        } else {
            this.UpdateState(ADCState.ResetFailed);
            console.log("ADC::Reset Failed.");
        }

        return isReady;
    }

    /**
     * Whether the ADC deserializer is locked (syzygy_adc STATUS.adc_ready).
     */
    public async IsReady(): Promise<boolean> {
        return ((await this.Read(ADC_CSR.STATUS)) & STATUS_READY) !== 0;
    }

    /** Read and decode syzygy_adc STATUS. */
    public async ReadStatus(): Promise<ADCStatus> {
        const raw = await this.Read(ADC_CSR.STATUS);

        return {
            raw,
            ready: (raw & STATUS_READY) !== 0,
            captureClkAlive: (raw & STATUS_CAPTURE_CLK_ALIVE) !== 0,
            alignDone: (raw & STATUS_ALIGN_DONE) !== 0,
            alignFail: (raw & STATUS_ALIGN_FAIL) !== 0,
            fifoOverflow: (raw & STATUS_FIFO_OVERFLOW) !== 0,
            frameError: (raw & STATUS_FRAME_ERROR) !== 0,
            overrideActive: (raw & STATUS_OVERRIDE_ACTIVE) !== 0,
            trackBusy: (raw & STATUS_TRACK_BUSY) !== 0,
            alignContinuous: (raw & STATUS_ALIGN_CONTINUOUS) !== 0
        };
    }

    private async Read(offset: number): Promise<number> {
        return (await this._AxiLite.read(offset)) >>> 0;
    }

    private async Write(offset: number, value: number): Promise<void> {
        await this._AxiLite.write(offset, value >>> 0);
    }

    private UpdateState(newState: ADCState) {
        if (newState !== this._State) {
            const previousState: ADCState = this._State;
            this._State = newState;

            this._StateChangedEvent.emit({
                sender: this,
                newState: this._State,
                previousState: previousState
            });
        }
    }
}
