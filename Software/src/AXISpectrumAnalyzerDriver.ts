/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { IFPGADataPortAXI, ByteCount } from "@opalkelly/frontpanel-platform-api";

import { AXIStreamSwitch } from "./AXIStreamSwitch";

import { SpectrumAnalyzerDriver, SpectrumAnalyzerState } from "./SpectrumAnalyzerDriver";

import FFTConfiguration from "./FFTConfiguration";

// CSR register map for fft_controller_csr.v on the spectrum analyzer slave
// (address space 0x0000_0000 - 0x0000_0fff).
//
//  0x0000_0000 CONTROL     [0]  R/W  Reset
//  0x0000_0040 TRIG_CTRL   [0]  WO   start
//  0x0000_0060 STATUS      [0]  RO   locked
//                          [1]  RO   prog_empty
//                          [2]  RO   prog_full

const CONTROL = {
    address: 0x00000000,
    RESET: 0x01,            // [0] R/W - hold spectrum FFT in reset
} as const;

const TRIG_CTRL = {
    address: 0x00000040,
    START: 0x01,            // [0] WO - start forward FFT compute
} as const;

const STATUS = {
    address: 0x00000060,
    LOCKED:     0x01,       // [0] RO - PLL clock locked
    PROG_EMPTY: 0x02,       // [1] RO - FFT TX FIFO has space for input
    PROG_FULL:  0x04,       // [2] RO - FFT RX FIFO has output ready to read
} as const;

const STREAM_SWITCH_BASE = 0x44a00000;
const STREAM_SLOT_SPECTRUM_OUT = 1;

/**
 * AXI Spectrum Analyzer
 */
export class AXISpectrumAnalyzerDriver extends SpectrumAnalyzerDriver {
    private readonly _FPGADataPort: IFPGADataPortAXI;

    private readonly _TimeoutMilliseconds = 5000;

    private readonly _StreamSwitch: AXIStreamSwitch;

    /**
     * Creates a new instance of the Spectrum Analyzer
     * @param fpgaDataPort - Object that implements the IFPGADataPortAXI interface used to communicate with device.
     * @param sampleSize - Sample size
     * @param sampleCount - Sample count
     */
    constructor(fpgaDataPort: IFPGADataPortAXI, fftConfiguration: FFTConfiguration, sampleSize: ByteCount) {
        super(fftConfiguration, sampleSize);

        this._FPGADataPort = fpgaDataPort;

        this._StreamSwitch = new AXIStreamSwitch(fpgaDataPort, STREAM_SWITCH_BASE);
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
            console.log("Digitizer::Reset Pending...");

            this.UpdateState(SpectrumAnalyzerState.ResetPending);

            // Assert Reset bit [0]
            await this._FPGADataPort.axiLite.write(CONTROL.address, CONTROL.RESET, this._TimeoutMilliseconds);

            // Deassert Reset bit [0]
            await this._FPGADataPort.axiLite.write(CONTROL.address, 0x00, this._TimeoutMilliseconds);

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
        // Write Source Signal Samples
        await this._FPGADataPort.axiStream.write(
            sourceSamples.buffer as ArrayBuffer,
            this._TimeoutMilliseconds
        );

        // Check for program empty
        let status = await this._FPGADataPort.axiLite.read(STATUS.address, this._TimeoutMilliseconds);
        let isProgramEmpty: boolean = (status & STATUS.PROG_EMPTY) == STATUS.PROG_EMPTY;

        for (let retryIndex = 1; retryIndex < 100 && !isProgramEmpty; retryIndex++) {
            status = await this._FPGADataPort.axiLite.read(STATUS.address, this._TimeoutMilliseconds);
            isProgramEmpty = (status & STATUS.PROG_EMPTY) == STATUS.PROG_EMPTY;
        }

        // Start FFT Calculation
        await this._FPGADataPort.axiLite.write(TRIG_CTRL.address, TRIG_CTRL.START, this._TimeoutMilliseconds);

        // Wait for program full
        status = await this._FPGADataPort.axiLite.read(STATUS.address, this._TimeoutMilliseconds);
        let isProgramFull: boolean = (status & STATUS.PROG_FULL) == STATUS.PROG_FULL;

        for (let retryIndex = 1; retryIndex < 100 && !isProgramFull; retryIndex++) {
            status = await this._FPGADataPort.axiLite.read(STATUS.address, this._TimeoutMilliseconds);
            isProgramFull = (status & STATUS.PROG_FULL) == STATUS.PROG_FULL;
        }

        // Set the Stream Switch to read FFT data
        await this._StreamSwitch.UpdateSlaveIndex(STREAM_SLOT_SPECTRUM_OUT);

        // Read Spectrum
        const outputDataSize: ByteCount = this.SampleSize * this.SampleCount; // Each sample has two components (real, imaginary)

        const outputData: ArrayBuffer = new ArrayBuffer(outputDataSize);

        await this._FPGADataPort.axiStream.read(
            outputData,
            this._TimeoutMilliseconds
        );

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
