/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { IFPGADataPortAXI } from "@opalkelly/frontpanel-platform-api";

import { AXIRegisterSet } from "./AXIRegisterSet";

import { WaveformGeneratorDriver, WaveformGeneratorState, FrequencyBin } from "./WaveformGeneratorDriver";

import FFTConfiguration, { BinNumber } from "./FFTConfiguration";

// CSR register map for waveform_generator_csr.v on the waveform-generator slave
// (address space 0x0000_4000 - 0x0000_7fff). VECTORS occupies the BRAM-backed
// region 0x0000_6000 - 0x0000_7fff for IFFT input bins.
//
//  0x0000_4000 CONTROL     [0]  R/W  Reset
//                          [1]  R/W  dac_disable
//  0x0000_4040 TRIG_CTRL   [0]  WO   start
//  0x0000_4060 STATUS      [0]  RO   locked
//                          [1]  RO   dac_ready
//  0x0000_6000 - 0x0000_7FFF VECTORS [31:0] R/W  BRAM-backed IFFT bin space

const CONTROL = {
    address: 0x00004000,
    RESET:       0x01,          // [0] R/W - hold IFFT in reset
    DAC_DISABLE: 0x02,          // [1] R/W - disable DAC output
} as const;

const TRIG_CTRL = {
    address: 0x00004040,
    START: 0x01,                // [0] WO - submit IFFT bin registers + start compute
} as const;

const STATUS = {
    address: 0x00004060,
    LOCKED:    0x01,            // [0] RO - PLL clock locked
    DAC_READY: 0x02,            // [1] RO - DAC ready to accept samples
} as const;

const VECTORS = {
    address: 0x00006000,        // BRAM-backed IFFT bin space (0x6000 - 0x7FFF)
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
 * AXI Waveform Generator
 */
export class AXIWaveformGeneratorDriver extends WaveformGeneratorDriver {
    private readonly _FPGADataPort: IFPGADataPortAXI;

    private readonly _TimeoutMilliseconds = 5000;

    private readonly _VectorRegisterSet: AXIRegisterSet;

    /**
     * Creates a new instance of the WaveformGenerator class.
     * @param fpgaDataPort - Object that implements the IFPGADataPortAXI interface used to communicate with device.
     * @param fftConfiguration - Configuration of the FFT.
     * @param retryCount - Number of times to retry an operation.
     */
    constructor(fpgaDataPort: IFPGADataPortAXI, fftConfiguration: FFTConfiguration, retryCount: number) {
        super(fftConfiguration, retryCount);

        this._FPGADataPort = fpgaDataPort;

        this._VectorRegisterSet = new AXIRegisterSet(
            VECTORS.address, fftConfiguration.FFTLength * 2, 4);
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

            try {
                // Wait for Clocks to Lock
                let status = await this._FPGADataPort.axiLite.read(STATUS.address, this._TimeoutMilliseconds);
                let isLocked: boolean = (status & STATUS.LOCKED) == STATUS.LOCKED;

                for (let retryIndex = 1; retryIndex < this.RetryCount && !isLocked; retryIndex++) {
                    status = await this._FPGADataPort.axiLite.read(STATUS.address, this._TimeoutMilliseconds);
                    isLocked = (status & STATUS.LOCKED) == STATUS.LOCKED;
                }

                if (isLocked) {
                    this.UpdateState(WaveformGeneratorState.InitializationComplete);

                    console.log("WaveformGenerator::Initialization Complete.");
                } else {
                    this.UpdateState(WaveformGeneratorState.InitializationFailed);

                    console.log("WaveformGenerator::Initialization Failed.");
                }

                retval = isLocked;
            }
            catch(error) {
                console.error(`Failed to initialize Waveform Generator: \n${error}`);
                this.UpdateState(WaveformGeneratorState.InitializationFailed);
                retval = false;     // ERROR: Failed to Initialize
            }
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

            try {
                // Reset IFFT
                await this.ClearAllBinRegisters();
                await this.SubmitBins();

                // Assert Reset bit [0]
                await this._FPGADataPort.axiLite.write(CONTROL.address, CONTROL.RESET, this._TimeoutMilliseconds);

                // Deassert Reset bit [0]
                await this._FPGADataPort.axiLite.write(CONTROL.address, 0x00, this._TimeoutMilliseconds);

                // Wait for DAC to be ready
                let status = await this._FPGADataPort.axiLite.read(STATUS.address, this._TimeoutMilliseconds);
                let isDACReady: boolean = (status & STATUS.DAC_READY) == STATUS.DAC_READY;

                for (let retryIndex = 1; retryIndex < this.RetryCount && !isDACReady; retryIndex++) {
                    status = await this._FPGADataPort.axiLite.read(STATUS.address, this._TimeoutMilliseconds);
                    isDACReady = (status & STATUS.DAC_READY) == STATUS.DAC_READY;
                }

                if (isDACReady) {
                    this.UpdateState(WaveformGeneratorState.ResetComplete);

                    console.log("WaveformGenerator::Reset Complete.");
                } else {
                    this.UpdateState(WaveformGeneratorState.ResetFailed);

                    console.log("WaveformGenerator::Reset Failed.");
                }

                retval = isDACReady;
            }
            catch(error) {
                console.error(`Failed to reset Waveform Generator: \n${error}`);
                this.UpdateState(WaveformGeneratorState.ResetFailed);
                retval = false;     // ERROR: Failed to Reset
            }
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
        // Set the real and imaginary components of each frequency bin. (2 registers per bin)
        for (let binIndex = 0; binIndex < bins.length; binIndex++) {
            const registerIndex = bins[binIndex].number * 2;
            const value = Math.floor(
                bins[binIndex].amplitude *
                    IFFT_INPUT_PEAK *
                    amplitudeScaleFactor
            );

            this._VectorRegisterSet.setUint32Register(registerIndex, value);
            this._VectorRegisterSet.setUint32Register(registerIndex + 1, 0x00);
        }

        // Write Registers
        await this._FPGADataPort.axiLite.writeBulk(
            this._VectorRegisterSet.BaseAddress,
            this._VectorRegisterSet.Uint32View,
            this._TimeoutMilliseconds);
    }

    /**
     * Clears register values for the specified bin numbers
     * @param binNumbers - Array of bin numbers to clear
     * @returns Promise that resolves when the registers for all of the specified bins have been cleared.
     */
    protected async ClearBinRegisters(binNumbers: BinNumber[]): Promise<void> {
        // Clear the real and imaginary components of each frequency bin. (2 registers per bin)
        for (let binIndex = 0; binIndex < binNumbers.length; binIndex++) {
            const registerIndex = binNumbers[binIndex] * 2;

            this._VectorRegisterSet.setUint32Register(registerIndex, 0x00);
            this._VectorRegisterSet.setUint32Register(registerIndex + 1, 0x00);
        }

        // Write Registers
        await this._FPGADataPort.axiLite.writeBulk(
            this._VectorRegisterSet.BaseAddress,
            this._VectorRegisterSet.Uint32View,
            this._TimeoutMilliseconds);
    }

    /**
     * Clears register values for all of the bins.
     * @returns Promise that resolves to true when all the bins are cleared, otherwise false.
     */
    protected async ClearAllBinRegisters(): Promise<void> {
        // Clear the real and imaginary components of each frequency bin. (2 registers per bin)
        for (let registerIndex = 0; registerIndex < this._VectorRegisterSet.RegisterCount; registerIndex++) {
            this._VectorRegisterSet.setUint32Register(registerIndex, 0x00);
        }

        // Write Registers
        await this._FPGADataPort.axiLite.writeBulk(
            this._VectorRegisterSet.BaseAddress,
            this._VectorRegisterSet.Uint32View,
            this._TimeoutMilliseconds);
    }

    /**
     * Submits the frequency bin data to the IFFT.
     * @returns Promise that resolves when the bin data has been submitted.
     */
    protected async SubmitBins(): Promise<void> {
        // Submits the Bin data to the IFFT
        await this._FPGADataPort.axiLite.write(
            TRIG_CTRL.address,
            TRIG_CTRL.START,
            this._TimeoutMilliseconds);
    }
}
