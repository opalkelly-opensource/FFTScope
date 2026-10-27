/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IFPGADataPortAXI } from "@opalkelly/frontpanel-platform-api";

import { pollUntil, POLL_INTERVAL_MS } from "./poll";

import { ADCDriver, ADCState } from "./ADCDriver";
import { CapturePath, DatapathCtrlDriver } from "./DatapathCtrlDriver";

/** capture_done should assert within a frame time; 50 x 5 ms is generous. */
const CAPTURE_POLL_ATTEMPTS = 50;

/** One acquisition: arm, wait for capture_done, drain the selected buffer. */
export class CaptureSequencer {
    private readonly _Ctrl: DatapathCtrlDriver;
    private readonly _Adc: ADCDriver;
    private readonly _AxiStream: IFPGADataPortAXI["axiStream"];

    private readonly _SampleCount: number;
    private readonly _SpectrumLength: number;

    /** Time-domain samples returned per channel. */
    public get SampleCount() {
        return this._SampleCount;
    }

    /**
     * Number of useful frequency bins per capture: an N-point FFT of a real
     * signal has N/2 unique positive-frequency bins spanning DC..Nyquist.
     */
    public get BinCount() {
        return this._SpectrumLength >> 1;
    }

    public get State(): ADCState {
        return this._Adc.State;
    }

    public get StateChangedEvent() {
        return this._Adc.StateChangedEvent;
    }

    /**
     * @param ctrl - datapath_ctrl driver.
     * @param adc - syzygy_adc driver.
     * @param axiStream - Native AXI stream; only the read direction is used here.
     * @param sampleCount - Number of time-domain samples per channel to return.
     * @param spectrumLength - Gateware forward-FFT length.
     */
    constructor(
        ctrl: DatapathCtrlDriver,
        adc: ADCDriver,
        axiStream: IFPGADataPortAXI["axiStream"],
        sampleCount: number,
        spectrumLength: number
    ) {
        this._Ctrl = ctrl;
        this._Adc = adc;
        this._AxiStream = axiStream;
        this._SampleCount = sampleCount;
        this._SpectrumLength = spectrumLength;
    }

    /**
     * Re-sequence the ADC and wait for the deserializer to lock.
     * @returns False if a reset is already in flight, or the lock never asserted.
     */
    public async Reset(): Promise<boolean> {
        return this._Adc.Reset();
    }

    /**
     * Capture one time-domain frame and de-interleave the two channels.
     * @param channels - Array of at least two Int16Arrays (length >= SampleCount).
     * @returns Promise that resolves to true when the samples are read successfully, otherwise false.
     */
    public async ReadSamples(channels: Int16Array[]): Promise<boolean> {
        if (this._Adc.State !== ADCState.ResetComplete) {
            return false; // the ADC is not reset
        }

        // The ADC FIFO overflows between captures, so the first frame after an
        // input change is one frame stale; capture and discard one first.
        await this.CaptureFrame(CapturePath.Time);
        const buffer = await this.CaptureFrame(CapturePath.Time);

        const samples: Int16Array = new Int16Array(buffer);
        const count: number = Math.min(this.SampleCount, samples.length >> 1);
        for (let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
            // ADC packs {ch1[31:16], ch2[15:0]} (Zmod): ch1 = high (odd) int16.
            channels[0][sampleIndex] = samples[2 * sampleIndex + 1];
            channels[1][sampleIndex] = samples[2 * sampleIndex];
        }

        return true;
    }

    /**
     * Capture one frequency-domain frame and return both channels' magnitudes.
     * Nothing is computed on the host. This reads back a spectrum the gateware
     * already produced.
     *
     * @returns Per-bin magnitudes for both channels, each BinCount long. A short
     *   frame leaves the tail at 0.
     */
    public async ReadSpectrum(): Promise<{ mag1: Float64Array; mag2: Float64Array }> {
        const buffer = await this.CaptureFrame(CapturePath.Freq);

        const samples = new Int16Array(buffer);

        // Beat 0 is the in-band block-exponent header, not a bin:
        //   64-bit header = {27'b0, ch2_exp[4:0], 27'b0, ch1_exp[4:0]}
        //   little-endian int16: [ch1_exp, 0, ch2_exp, 0]
        // Bins are BFP mantissas; 2^exp recovers the absolute DFT magnitude.
        const scale1 = Math.pow(2, samples[0] & 0x1f); // ch1 block exponent
        const scale2 = Math.pow(2, samples[2] & 0x1f); // ch2 block exponent

        const BIN_BASE = 4; // skip the 4-int16 header beat
        const totalBins = (samples.length >> 2) - 1; // 4 int16/bin, minus header
        const useful = Math.min(this.BinCount, totalBins); // positive-frequency half
        const mag1 = new Float64Array(this.BinCount);
        const mag2 = new Float64Array(this.BinCount);
        for (let k = 0; k < useful; k++) {
            const b = BIN_BASE + 4 * k;
            mag1[k] = Math.hypot(samples[b], samples[b + 1]) * scale1;
            mag2[k] = Math.hypot(samples[b + 2], samples[b + 3]) * scale2;
        }

        return { mag1, mag2 };
    }

    /**
     * Route the readback mux, arm one capture, poll capture_done, then drain
     * READ_COUNT 64-bit beats off s_axis.
     *
     * path_sel only selects which buffer s_axis drains; every arm captures the
     * time frame and runs both forward FFTs regardless.
     * @param path - Readback source to drain.
     */
    private async CaptureFrame(path: CapturePath): Promise<ArrayBuffer> {
        await this._Ctrl.SelectPath(path);
        await this._Ctrl.Arm();

        let raw = 0;
        const done = await pollUntil(
            async () => {
                const status = await this._Ctrl.ReadStatus();
                raw = status.raw;
                return status.captureDone;
            },
            CAPTURE_POLL_ATTEMPTS,
            POLL_INTERVAL_MS
        );

        if (!done) {
            const pathName = path === CapturePath.Freq ? "freq" : "time";
            const adcRdy = await this._Adc.IsReady();
            throw new Error(
                `capture_done did not assert on the ${pathName} path ` +
                    `(STATUS=0x${raw.toString(16)}). ` +
                    `Is the ADC clocked? adc_rdy=${adcRdy ? 1 : 0}`
            );
        }

        const beats = await this._Ctrl.ReadCount();
        const buffer = new ArrayBuffer(beats * 8); // 64-bit beats
        await this._AxiStream.read(buffer);

        return buffer;
    }
}
