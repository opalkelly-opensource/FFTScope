/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ByteCount } from "@opalkelly/frontpanel-platform-api";

import { SubEvent } from "sub-events";

import FFTConfiguration from "./FFTConfiguration";

/**
 * Enumeration representing the possible states of the Spectrum Analyzer.
 */
export enum SpectrumAnalyzerState {
    Initial,
    InitializePending,
    InitializationComplete,
    InitializationFailed,
    ResetPending,
    ResetComplete,
    ResetFailed
}

/**
 * Event arguments for the Spectrum Analyzer State Change Event
 */
export interface SpectrumAnalyzerStateChangeEventArgs {
    sender: SpectrumAnalyzerDriver;
    newState: SpectrumAnalyzerState;
    previousState: SpectrumAnalyzerState;
}

/**
 * Spectrum Analyzer
 */
export abstract class SpectrumAnalyzerDriver {
    private readonly _FFTConfiguration: FFTConfiguration;

    private readonly _SampleSize: ByteCount;

    private _State: SpectrumAnalyzerState = SpectrumAnalyzerState.Initial;

    private readonly _StateChangedEvent: SubEvent<SpectrumAnalyzerStateChangeEventArgs> =
        new SubEvent<SpectrumAnalyzerStateChangeEventArgs>();

    /**
     * Get the configuration of the FFT.
     */
    public get FFTConfiguration() {
        return this._FFTConfiguration;
    }

    public get SampleSize() {
        return this._SampleSize;
    }

    public get SampleCount() {
        return this._FFTConfiguration.FFTLength;
    }
    /**
     * Get the current state of the Spectrum Analyzer.
     */
    public get State() {
        return this._State;
    }

    /**
     *  Get the StateChanged event used to monitor changes to the state of the Spectrum Analyzer.
     */
    public get StateChangedEvent() {
        return this._StateChangedEvent;
    }

    /**
     * Creates a new instance of the Spectrum Analyzer
     * @param sampleSize - Sample size
     * @param sampleCount - Sample count
     */
    constructor(fftConfiguration: FFTConfiguration, sampleSize: ByteCount) {
        this._FFTConfiguration = fftConfiguration;
        this._SampleSize = sampleSize;

        this._State = SpectrumAnalyzerState.InitializationComplete;
    }

    /**
     * Performs reset of the Spectrum Analyzer.
     * @returns Promise that resolves to true when the reset is successful, otherwise false.
     */
    public abstract Reset(): Promise<boolean>;

    /**
     * Computes the spectrum of the input samples
     * @param sourceSamples - Time domain signal samples
     * @param outputSamples - Frequency domain samples
     * @returns True if the operation was successful, otherwise false
     */
    public abstract ComputeSpectrum(
        sourceSamples: Int16Array,
        outputSamples: Float64Array
    ): Promise<boolean>;

    /**
     * Updates the current state of the Spectrum Analyzer and dispatches the StateChangedEvent.
     * @param newState - The new state of the Spectrum Analyzer.
     */
    protected UpdateState(newState: SpectrumAnalyzerState) {
        if (newState !== this._State) {
            const previousState: SpectrumAnalyzerState = this._State;
            this._State = newState;

            this._StateChangedEvent.emit({
                sender: this,
                newState: this._State,
                previousState: previousState
            });
        }
    }

}
