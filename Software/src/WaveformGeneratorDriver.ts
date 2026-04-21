/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { SubEvent } from "sub-events/dist/src/event";

import FFTConfiguration, { BinNumber } from "./FFTConfiguration";

/**
 * Type representing a frequency bin defined by a bin number and an amplitude value.
 */
export type FrequencyBin = {
    number: BinNumber;
    amplitude: number;
};

/**
 * Enumeration representing the possible states of the Waveform Generator.
 */
export enum WaveformGeneratorState {
    Initial,
    InitializePending,
    InitializationComplete,
    InitializationFailed,
    ResetPending,
    ResetComplete,
    ResetFailed
}

/**
 * Event arguments for the Waveform Generator StateChanged event.
 */
export interface WaveformGeneratorStateChangeEventArgs {
    sender: WaveformGeneratorDriver;
    newState: WaveformGeneratorState;
    previousState: WaveformGeneratorState;
}

/**
 * Waveform Generator
 */
export abstract class WaveformGeneratorDriver {
    // Important: the IFFT bins are implemented as:
    // bin n real component = n * 2
    // bin n imaginary component = n * 2 + 1

    private readonly _FFTConfiguration: FFTConfiguration;

    private readonly _RetryCount: number;

    private _State: WaveformGeneratorState = WaveformGeneratorState.Initial;

    private readonly _StateChangedEvent: SubEvent<WaveformGeneratorStateChangeEventArgs> =
        new SubEvent<WaveformGeneratorStateChangeEventArgs>();

    /**
     * Get the configuration of the FFT.
     */
    public get FFTConfiguration() {
        return this._FFTConfiguration;
    }

    /**
     * Get the retry count to use when initializing and resetting.
     */
    public get RetryCount() {
        return this._RetryCount;
    }

    /**
     * Get the current state of the Waveform Generator.
     */
    public get State() {
        return this._State;
    }

    /**
     * Get the StateChanged event used to monitor changes to the state of the Waveform Generator.
     */
    public get StatechangedEvent() {
        return this._StateChangedEvent;
    }

    /**
     * Creates a new instance of the WaveformGenerator class.
     * @param fftConfiguration - Configuration of the FFT.
     * @param retryCount - Number of times to retry an operation.
     */
    constructor(fftConfiguration: FFTConfiguration, retryCount: number) {
        this._FFTConfiguration = fftConfiguration;
        this._RetryCount = retryCount;
    }

    /**
     * Initializes the Waveform Generator.
     * @returns Promise that resolves to true when the Waveform Generator has been initialized, otherwise false.
     */
    public abstract Initialize(): Promise<boolean>;

    /**
     * Resets the Waveform Generator and clears all of the IFFT bins.
     * @returns Promise that resolves to true when the Waveform Generator has been reset, otherwise false.
     */
    public abstract Reset(): Promise<boolean>;

    /**
     * Sets the specified IFFT bins.
     * @param bins - Array of frequency bins to set.
     * @param scale - Scale factor to apply to the frequency bin amplitude values.
     * @returns Promise that resolves to true when all the specified bins are set, otherwise false.
     */
    public async SetBins(bins: FrequencyBin[], scale: number): Promise<boolean> {
        let retval: boolean;

        if (this._State === WaveformGeneratorState.ResetComplete) {
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

        if (this._State === WaveformGeneratorState.ResetComplete) {
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

        if (this._State === WaveformGeneratorState.ResetComplete) {
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
    protected abstract SetBinRegisters(
        bins: FrequencyBin[],
        amplitudeScaleFactor: number
    ): Promise<void>;

    /**
     * Clears register values for the specified bin numbers
     * @param binNumbers - Array of bin numbers to clear
     * @returns Promise that resolves when the registers for all of the specified bins have been cleared.
     */
    protected abstract ClearBinRegisters(binNumbers: BinNumber[]): Promise<void>;

    /**
     * Clears register values for all of the bins.
     * @returns Promise that resolves to true when all the bins are cleared, otherwise false.
     */
    protected abstract ClearAllBinRegisters(): Promise<void>;

    /**
     * Submits the frequency bin data to the IFFT.
     * @returns Promise that resolves when the bin data has been submitted.
     */
    protected abstract SubmitBins(): Promise<void>;

    /**
     * Updates the current state of the Waveform Generator and dispatches the StateChanged event.
     * @param newState - The new state of the Waveform Generator.
     */
    protected UpdateState(newState: WaveformGeneratorState) {
        if (newState !== this._State) {
            const previousState: WaveformGeneratorState = this._State;
            this._State = newState;

            this._StateChangedEvent.emit({
                sender: this,
                newState: this._State,
                previousState: previousState
            });
        }
    }
}
