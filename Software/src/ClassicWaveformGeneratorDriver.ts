/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { IFPGADataPortClassic } from "@opalkelly/frontpanel-platform-api";

import { WaveformGeneratorDriver, WaveformGeneratorState, FrequencyBin } from "./WaveformGeneratorDriver";

import FFTConfiguration, { BinNumber } from "./FFTConfiguration";

// FrontPanel endpoints owned by waveform_generator on the gateware side
// (Phase 4 — each subblock owns its own endpoints; nothing shared).
//
//   RegisterBridge: BRAM-backed IFFT bin space (sparse writes)
//   WireIn   0x00:  [0] RESET, [1] DAC_DISABLE
//   TriggerIn 0x40: [0] IFFT_SUBMIT, [1] CLK_RESET
//   WireOut  0x20:  [0] CLOCK_LOCKED, [1] DAC_READY
const WIRE_IN_CONTROL = {
    address: 0x00,
    RESET:       0x01,          // [0] R/W - hold IFFT in reset
    DAC_DISABLE: 0x02,          // [1] R/W - disable DAC output
} as const;

const TRIG_IN_CTRL = {
    address: 0x40,
    IFFT_SUBMIT: 0,             // bit 0 (passed to activateTriggerIn as a bit INDEX, not a mask)
    CLK_RESET:   1,             // bit 1
} as const;

const WIRE_OUT_STATUS = {
    address: 0x20,
    CLOCK_LOCKED: 0x01,         // [0] RO - PLL clock locked
    DAC_READY:    0x02,         // [1] RO - DAC ready to accept samples
} as const;

// Waveform generator writes IFFT bin amplitudes via the register bridge
// (sparse writes into BRAM-backed CSR space), not the bulk pipe/AXI
// Stream that the spectrum analyzer uses for dense FFT output samples.
//
// Peak raw integer value accepted by the IFFT input register: the
// 22-bit signed field maxes at 2^21 - 1 = 0x1FFFFF. Equal across both
// ADC variants because the IFFT input type (ap_fixed<22,11>) is
// variant-agnostic.
const IFFT_INPUT_PEAK = 0x1FFFFF;

/**
 * Waveform Generator
 */
export class ClassicWaveformGeneratorDriver extends WaveformGeneratorDriver {
    private readonly _FPGADataPort: IFPGADataPortClassic;

    /**
     * Creates a new instance of the WaveformGenerator class.
     * @param fpgaDataPort - Object that implements the IFPGADataPortClassic interface used to communicate with device.
     * @param fftConfiguration - Configuration of the FFT.
     * @param retryCount - Number of times to retry an operation.
     */
    constructor(fpgaDataPort: IFPGADataPortClassic, fftConfiguration: FFTConfiguration, retryCount: number) {
        super(fftConfiguration, retryCount);

        this._FPGADataPort = fpgaDataPort;
    }

    /**
     * Initializes the Waveform Generator.
     * @returns Promise that resolves to true when the Waveform Generator has been initialized, otherwise false.
     */
    public async Initialize(): Promise<boolean> {
        let retval: boolean;

        if (
            this.State === WaveformGeneratorState.Initial ||
            this.State === WaveformGeneratorState.InitializationFailed
        ) {
            console.log("WaveformGenerator::Initialization Pending...");

            this.UpdateState(WaveformGeneratorState.InitializePending);

            // Wait for Clocks to Lock
            await this._FPGADataPort.updateWireOuts();

            let isLocked: boolean = ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.CLOCK_LOCKED) === WIRE_OUT_STATUS.CLOCK_LOCKED;

            for (let retryIndex = 1; retryIndex < this.RetryCount && !isLocked; retryIndex++) {
                await this._FPGADataPort.updateWireOuts();

                isLocked = ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.CLOCK_LOCKED) === WIRE_OUT_STATUS.CLOCK_LOCKED;
            }

            if (isLocked) {
                this.UpdateState(WaveformGeneratorState.InitializationComplete);

                console.log("WaveformGenerator::Initialization Complete.");
            } else {
                this.UpdateState(WaveformGeneratorState.InitializationFailed);

                console.log("WaveformGenerator::Initialization Failed.");
            }

            retval = isLocked;
        } else {
            retval = false; // ERROR: Already Intialized
        }

        return retval;
    }

    /**
     * Resets the Waveform Generator and clears all of the IFFT bins.
     * @returns Promise that resolves to true when the Waveform Generator has been reset, otherwise false.
     */
    public async Reset(): Promise<boolean> {
        let retval: boolean;

        if (
            this.State === WaveformGeneratorState.InitializationComplete ||
            this.State === WaveformGeneratorState.ResetComplete ||
            this.State === WaveformGeneratorState.ResetFailed
        ) {
            console.log("WaveformGenerator::Reset Pending...");

            this.UpdateState(WaveformGeneratorState.ResetPending);

            // Reset IFFT
            await this.ClearAllBinRegisters();
            await this.SubmitBins();

            // Reset DAC
            this._FPGADataPort.setWireInValue(WIRE_IN_CONTROL.address, WIRE_IN_CONTROL.RESET, 0xffffffff);
            await this._FPGADataPort.updateWireIns();
            this._FPGADataPort.setWireInValue(WIRE_IN_CONTROL.address, 0x00000000, 0xffffffff);
            await this._FPGADataPort.updateWireIns();

            // Wait for DAC to be ready
            await this._FPGADataPort.updateWireOuts();

            let isDACReady: boolean =
                ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.DAC_READY) === WIRE_OUT_STATUS.DAC_READY;

            for (let retryIndex = 0; retryIndex < this.RetryCount && !isDACReady; retryIndex++) {
                await this._FPGADataPort.updateWireOuts();

                isDACReady =
                    ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.DAC_READY) === WIRE_OUT_STATUS.DAC_READY;
            }

            if (isDACReady) {
                this.UpdateState(WaveformGeneratorState.ResetComplete);

                console.log("WaveformGenerator::Reset Complete.");
            } else {
                this.UpdateState(WaveformGeneratorState.ResetFailed);

                console.log("WaveformGenerator::Reset Failed.");
            }

            retval = isDACReady;
        } else {
            retval = false; // ERROR: Invalid State
        }

        return retval;
    }

    /**
     * Sets the specified IFFT bins.
     * @param bins - Array of frequency bins to set.
     * @param scale - Scale factor to apply to the frequency bin amplitude values.
     * @returns Promise that resolves to true when all the specified bins are set, otherwise false.
     */
    public async SetBins(bins: FrequencyBin[], scale: number): Promise<boolean> {
        let retval: boolean;

        if (this.State === WaveformGeneratorState.ResetComplete) {
            await this.SetBinRegisters(bins, scale);

            await this.SubmitBins(); // Submits the Bin data to the IFFT

            retval = true; // SUCCESS: Bins Set
        } else {
            retval = false; // ERROR: Invalid State
        }

        return retval;
    }

    /**
     * Clears the specified IFFT bins.
     * @param clearBins - Array of frequency bin numbers of the bins to clear.
     * @returns Promise that resolves to true when all the specified bins are cleared, otherwise false.
     */
    public async ClearBins(clearBins: BinNumber[]): Promise<boolean> {
        let retval: boolean;

        if (this.State === WaveformGeneratorState.ResetComplete) {
            await this.ClearBinRegisters(clearBins);

            await this.SubmitBins(); // Submits the Bin data to the IFFT

            retval = true; // SUCCESS: Bins Set
        } else {
            retval = false; // ERROR: Invalid State
        }

        return retval;
    }

    /**
     * Clears all of the IFFT bins.
     * @returns Promise that resolves to true when all the bins are cleared, otherwise false.
     */
    public async ClearAllBins(): Promise<boolean> {
        let retval: boolean;

        if (this.State === WaveformGeneratorState.ResetComplete) {
            await this.ClearAllBinRegisters();

            await this.SubmitBins(); // Submits the Bin data to the IFFT

            retval = true; //SUCCESS: Bins Cleared
        } else {
            retval = false; //ERROR: Invalid State
        }

        return retval;
    }

    /**
     * Sets the register value for the each specified frequency bin using the bin number and the amplitude value multiplied by the scale factor.
     * @param bins - Array of frequency bins to set.
     * @param amplitudeScaleFactor - Scale factor to apply to the amplitude values.
     * @returns Promise that resolves when all of the bin registers have been set.
     */
    protected async SetBinRegisters(
        bins: FrequencyBin[],
        amplitudeScaleFactor: number
    ): Promise<void> {
        const registerWriteOperations: Promise<void>[] = [];

        for (let binIndex = 0; binIndex < bins.length; binIndex++) {
            const address = bins[binIndex].number * 2;
            const value = Math.floor(
                bins[binIndex].amplitude *
                    IFFT_INPUT_PEAK *
                    amplitudeScaleFactor
            );

            const operation = this._FPGADataPort.writeRegister(address, value);

            registerWriteOperations.push(operation);
        }

        await Promise.all(registerWriteOperations);
    }

    /**
     * Clears register values for the specified bin numbers
     * @param binNumbers - Array of bin numbers to clear
     * @returns Promise that resolves when the registers for all of the specified bins have been cleared.
     */
    protected async ClearBinRegisters(binNumbers: BinNumber[]): Promise<void> {
        const registerWriteOperations: Promise<void>[] = [];

        for (let binIndex = 0; binIndex < binNumbers.length; binIndex++) {
            const address = binNumbers[binIndex] * 2;

            const operation = this._FPGADataPort.writeRegister(address, 0x00);

            registerWriteOperations.push(operation);
        }

        await Promise.all(registerWriteOperations);
    }

    /**
     * Clears register values for all of the bins.
     * @returns Promise that resolves to true when all the bins are cleared, otherwise false.
     */
    protected async ClearAllBinRegisters(): Promise<void> {
        // Reset the real and imaginary components of each frequency bin. (2 registers per bin)
        const registerCount: number = this.FFTConfiguration.FFTLength;

        const registerWriteOperations: Promise<void>[] = [];

        for (let registerIndex = 0; registerIndex < registerCount; registerIndex++) {
            const operation = this._FPGADataPort.writeRegister(registerIndex, 0x00);

            registerWriteOperations.push(operation);
        }

        await Promise.all(registerWriteOperations);
    }

    /**
     * Submits the frequency bin data to the IFFT.
     * @returns Promise that resolves when the bin data has been submitted.
     */
    protected SubmitBins(): Promise<void> {
        return this._FPGADataPort.activateTriggerIn(TRIG_IN_CTRL.address, TRIG_IN_CTRL.IFFT_SUBMIT); // Submits the Bin data to the IFFT
    }
}
