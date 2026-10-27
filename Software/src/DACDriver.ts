/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IFPGADataPortAXI, IFPGADataPortAXILite } from "@opalkelly/frontpanel-platform-api";

import { BinNumber } from "./FFTConfiguration";

import { pollUntil, POLL_INTERVAL_MS } from "./poll";

import { DatapathCtrlDriver } from "./DatapathCtrlDriver";

/** syzygy_dac register byte offsets (base 0x1000). */
const DAC_CSR = {
    STATUS: 0x1004 // R   [0]=dac_ready, [1]=fifo_underflow (sticky)
} as const;

const STATUS_READY = 1 << 0;
const STATUS_FIFO_UNDERFLOW = 1 << 1; // sticky; cleared by CTRL clear_flags

export type FrequencyBin = {
    number: BinNumber;
    amplitude: number;
};

/**
 * DAC output channel. Channel A drives the reconstructed real (I) output; channel
 * B drives the imaginary (Q) output. A host spectrum staged as A + jB
 * reconstructs two independent waveforms.
 */
enum WaveformChannel {
    A = 0,
    B = 1
}

/** Decoded syzygy_dac STATUS. fifoUnderflow is sticky (cleared by CTRL clear_flags). */
export interface DACStatus {
    raw: number;
    ready: boolean;
    fifoUnderflow: boolean;
}

// Peak int16 value per IFFT input component. dac_convert is a
// NON-saturating bit-slice (XK_RE[15:4]), so a reconstructed sample reaching
// XK_RE >= 32768 wraps to full negative. The guard keeps the worst-case peak
// clear of that wrap at every frequency, costing -0.068 dBFS of output level.
const IFFT_INPUT_GUARD = 256;
const IFFT_INPUT_PEAK = 32767 - IFFT_INPUT_GUARD; // 32511

export class DACDriver {
    private readonly _IFFTLength: number;

    private readonly _RetryCount: number;

    private _PlaybackEnabled = false;

    private readonly _AxiLite: IFPGADataPortAXILite;
    private readonly _Ctrl: DatapathCtrlDriver;
    private readonly _AxiStream: IFPGADataPortAXI["axiStream"];

    // Persistent interleaved complex spectrum staged for the inverse FFT:
    //   bin n real (channel A) = index n*2,  imaginary (channel B) = n*2 + 1.
    private readonly _Spectrum: Int16Array;

    /**
     * @param axiLite - Native AXI-Lite port, for the syzygy_dac CSR at 0x1000.
     * @param ctrl - datapath_ctrl driver, for dac_enable / play_ready.
     * @param axiStream - Native AXI stream; only the write direction is used here.
     * @param ifftLength - Gateware inverse-FFT frame length in complex bins.
     * @param retryCount - How many extra times to poll play_ready before warning.
     */
    constructor(
        axiLite: IFPGADataPortAXILite,
        ctrl: DatapathCtrlDriver,
        axiStream: IFPGADataPortAXI["axiStream"],
        ifftLength: number,
        retryCount: number
    ) {
        this._AxiLite = axiLite;
        this._Ctrl = ctrl;
        this._AxiStream = axiStream;
        this._IFFTLength = ifftLength;
        this._RetryCount = retryCount;
        this._Spectrum = new Int16Array(ifftLength * 2);
    }

    /**
     * Enable the playout path (dac_enable) before streaming, then clear the staged
     * frame and push it.
     */
    public async EnablePlayback(): Promise<boolean> {
        console.log("DAC::EnablePlayback Pending...");

        await this._Ctrl.SetDacEnable(true);

        // Clear the staged spectrum and push it (DAC plays silence until SetSpectrumDual).
        this.ClearAllBinRegisters();
        await this.SubmitBins();

        this._PlaybackEnabled = true;

        const playReady = await pollUntil(
            () => this.IsPlayReady(),
            this._RetryCount + 1,
            POLL_INTERVAL_MS
        );
        if (!playReady) {
            console.warn("DAC::EnablePlayback play_ready did not assert (continuing anyway).");
        }

        console.log("DAC::EnablePlayback Complete.");
        return true;
    }

    /** Read and decode syzygy_dac STATUS. */
    public async ReadStatus(): Promise<DACStatus> {
        const raw = (await this._AxiLite.read(DAC_CSR.STATUS)) >>> 0;

        return {
            raw,
            ready: (raw & STATUS_READY) !== 0,
            fifoUnderflow: (raw & STATUS_FIFO_UNDERFLOW) !== 0
        };
    }

    /**
     * Replaces the entire dual-channel spectrum: clears every staged bin, stages
     * channel A and channel B, and submits the result as one IFFT frame.
     *
     * @param binsA - Channel A frequency bins (real / DAC I output).
     * @param scaleA - Amplitude scale factor for channel A.
     * @param binsB - Channel B frequency bins (imaginary / DAC Q output).
     * @param scaleB - Amplitude scale factor for channel B.
     * @returns False if EnablePlayback has not run.
     */
    public async SetSpectrumDual(
        binsA: FrequencyBin[],
        scaleA: number,
        binsB: FrequencyBin[],
        scaleB: number
    ): Promise<boolean> {
        if (!this._PlaybackEnabled) {
            return false;
        }

        this.ClearAllBinRegisters();
        this.SetChannelBinRegisters(WaveformChannel.A, binsA, scaleA);
        this.SetChannelBinRegisters(WaveformChannel.B, binsB, scaleB);

        await this.SubmitBins();

        return true;
    }

    public async IsPlayReady(): Promise<boolean> {
        return this._Ctrl.IsPlayReady();
    }

    /**
     * Stage the specified bins onto one output channel: channel A writes the real
     * component, channel B the imaginary. Each tone is placed conjugate-symmetrically
     * (half at bin k, half at the mirror bin N-k) so the two DAC outputs stay
     * independent.
     */
    private SetChannelBinRegisters(
        channel: WaveformChannel,
        bins: FrequencyBin[],
        amplitudeScaleFactor: number
    ): void {
        const length = this._IFFTLength;
        const component = channel === WaveformChannel.B ? 1 : 0; // 0 = real (A), 1 = imag (B)
        for (let binIndex = 0; binIndex < bins.length; binIndex++) {
            const bin = bins[binIndex].number;
            if (bin < 0 || bin >= length) {
                continue;
            }
            const value = Math.floor(bins[binIndex].amplitude * IFFT_INPUT_PEAK * amplitudeScaleFactor);
            const mirror = (length - bin) % length;
            if (mirror === bin) {
                // DC or Nyquist: its own conjugate mirror -> one bin, full value.
                this.Accumulate(bin * 2 + component, value);
            } else {
                // Split conjugate-symmetrically so IFFT stays real.
                const half = Math.floor(value / 2);
                this.Accumulate(bin * 2 + component, half);
                this.Accumulate(mirror * 2 + component, half);
            }
        }
    }

    /** Saturates at int16 rather than wrapping. */
    private Accumulate(index: number, delta: number): void {
        this._Spectrum[index] = clampInt16(this._Spectrum[index] + delta);
    }

    /** Zero the entire staged frame. */
    private ClearAllBinRegisters(): void {
        this._Spectrum.fill(0);
    }

    /**
     * Stream the staged complex spectrum frame down m_axis. The inverse FFT
     * auto-runs on the frame TLAST, and the result loops out the DAC.
     */
    private async SubmitBins(): Promise<void> {
        // Copy into a standalone ArrayBuffer so the staged view is never detached.
        const buffer = new ArrayBuffer(this._Spectrum.byteLength);
        new Int16Array(buffer).set(this._Spectrum);
        await this._AxiStream.write(buffer);
    }
}

function clampInt16(value: number): number {
    return Math.max(-32768, Math.min(32767, value));
}
