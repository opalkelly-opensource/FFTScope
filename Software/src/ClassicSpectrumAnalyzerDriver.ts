/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { IFPGADataPortClassic, ByteCount } from "@opalkelly/frontpanel-platform-api";

import { SpectrumAnalyzerDriver, SpectrumAnalyzerState } from "./SpectrumAnalyzerDriver";

import FFTConfiguration from "./FFTConfiguration";

// FrontPanel endpoints owned by spectrum_analyzer on the gateware side
// (Phase 4 — each subblock owns its own endpoints; nothing shared).
//
//   PipeIn   0x80:  time-domain samples (host -> FFT)
//   PipeOut  0xa1:  FFT bin output (real Int32 + imag Int32 per bin)
//   WireIn   0x02:  [0] RESET
//   TriggerIn 0x41: [0] FFT_START
//   WireOut  0x22:  [0] CLOCK_LOCKED, [1] FFT_TX_PROG_EMPTY, [2] FFT_RX_PROG_FULL
const PIPE_IN_FFT_INPUT  = 0x80;
const PIPE_OUT_FFT_OUTPUT = 0xa1;

const WIRE_IN_CONTROL = {
    address: 0x02,
    RESET: 0x01,                // [0] R/W - hold spectrum FFT in reset
} as const;

const TRIG_IN_CTRL = {
    address: 0x41,
    FFT_START: 0,               // bit 0 (passed to activateTriggerIn as a bit INDEX, not a mask)
} as const;

const WIRE_OUT_STATUS = {
    address: 0x22,
    CLOCK_LOCKED:      0x01,    // [0] RO - PLL clock locked
    FFT_TX_PROG_EMPTY: 0x02,    // [1] RO - FFT TX FIFO has space for input
    FFT_RX_PROG_FULL:  0x04,    // [2] RO - FFT RX FIFO has output ready
} as const;

/**
 * Spectrum Analyzer
 */
export class ClassicSpectrumAnalyzerDriver extends SpectrumAnalyzerDriver {
    private readonly _FPGADataPort: IFPGADataPortClassic;

    /**
     * Creates a new instance of the Spectrum Analyzer
     * @param fpgaDataPort - Object that implements the IFPGADataPortClassic interface used to communicate with device.
     * @param sampleSize - Sample size
     * @param sampleCount - Sample count
     */
    constructor(fpgaDataPort: IFPGADataPortClassic, fftConfiguration: FFTConfiguration, sampleSize: ByteCount) {
        super(fftConfiguration, sampleSize);

        this._FPGADataPort = fpgaDataPort;
    }

    /**
     * Performs reset of the Spectrum Analyzer.
     * @returns Promise that resolves to true when the reset is successful, otherwise false.
     */
    public async Reset(): Promise<boolean> {
        let retval: boolean;

        if (
            this.State === SpectrumAnalyzerState.InitializationComplete ||
            this.State === SpectrumAnalyzerState.ResetComplete ||
            this.State === SpectrumAnalyzerState.ResetFailed
        ) {
            this.UpdateState(SpectrumAnalyzerState.ResetPending);

            // Pulse RESET in the WireIn control register.
            this._FPGADataPort.setWireInValue(WIRE_IN_CONTROL.address, WIRE_IN_CONTROL.RESET, 0xffffffff);
            await this._FPGADataPort.updateWireIns();
            this._FPGADataPort.setWireInValue(WIRE_IN_CONTROL.address, 0x00000000, 0xffffffff);
            await this._FPGADataPort.updateWireIns();

            this.UpdateState(SpectrumAnalyzerState.ResetComplete);
            retval = true;
        } else {
            retval = false; // ERROR: Invalid State
        }

        return retval;
    }

    /**
     * Computes the spectrum of the input samples
     * @param sourceSamples - Time domain signal samples
     * @param outputSamples - Frequency domain samples
     * @returns True if the operation was successful, otherwise false
     */
    public async ComputeSpectrum(
        sourceSamples: Int16Array,
        outputSamples: Float64Array
    ): Promise<boolean> {
        // Write Samples
        await this._FPGADataPort.writeToPipeIn(
            PIPE_IN_FFT_INPUT,
            sourceSamples.buffer as ArrayBuffer
        );

        // Check for program empty
        await this._FPGADataPort.updateWireOuts();

        let isProgramEmpty: boolean =
            ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.FFT_TX_PROG_EMPTY) === WIRE_OUT_STATUS.FFT_TX_PROG_EMPTY;

        while (isProgramEmpty) {
            await this._FPGADataPort.updateWireOuts();

            isProgramEmpty = ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.FFT_TX_PROG_EMPTY) === WIRE_OUT_STATUS.FFT_TX_PROG_EMPTY;
        }

        // Start FFT Calculation
        await this._FPGADataPort.activateTriggerIn(TRIG_IN_CTRL.address, TRIG_IN_CTRL.FFT_START);

        // Wait for program full
        let isProgramFull: boolean = ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.FFT_RX_PROG_FULL) === WIRE_OUT_STATUS.FFT_RX_PROG_FULL;

        while (!isProgramFull) {
            await this._FPGADataPort.updateWireOuts();

            isProgramFull = ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.FFT_RX_PROG_FULL) === WIRE_OUT_STATUS.FFT_RX_PROG_FULL;
        }

        // Read via pipe poa1
        const outputDataSize: ByteCount = this.SampleSize * this.SampleCount; // Each sample has two components (real, imaginary)

        const outputData: ArrayBuffer = new ArrayBuffer(outputDataSize);

        await this._FPGADataPort.readFromPipeOut(PIPE_OUT_FFT_OUTPUT, outputData);

        const output: DataView = new DataView(outputData);

        for (let sampleIndex = 0; sampleIndex < this.SampleCount; sampleIndex++) {
            const byteOffset: ByteCount = sampleIndex * this.SampleSize;

            const real: number = output.getInt32(byteOffset, true);
            const imaginary: number = output.getInt32(byteOffset + 4, true);

            outputSamples[sampleIndex] = Math.sqrt(real * real + imaginary * imaginary);
        }

        return true;
    }
}
