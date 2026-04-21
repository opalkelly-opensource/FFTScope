/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ByteCount } from "@opalkelly/frontpanel-platform-api";

import { SubEvent } from "sub-events";

/**
 * Enumeration representing the possible states of the Digitizer.
 */
export enum DigitizerState {
    Initial,
    InitializePending,
    InitializationComplete,
    InitializationFailed,
    ResetPending,
    ResetComplete,
    ResetFailed
}

/**
 * Event arguments for the Digitizer State Change Event
 */
export interface DigitizerStateChangeEventArgs {
    sender: DigitizerDriver;
    newState: DigitizerState;
    previousState: DigitizerState;
}

/**
 * Class representing a Digitizer.
 */
export abstract class DigitizerDriver {
    private readonly _SampleSize: ByteCount;
    private readonly _SampleCount: number;

    private _State: DigitizerState = DigitizerState.Initial;

    private readonly _StateChangedEvent: SubEvent<DigitizerStateChangeEventArgs> =
        new SubEvent<DigitizerStateChangeEventArgs>();

    /**
     * Get the size of each sample in bytes.
     */
    public get SampleSize() {
        return this._SampleSize;
    }

    /**
     * Get the sample count.
     */
    public get SampleCount() {
        return this._SampleCount;
    }

    /**
     * Get the current state of the Digitizer.
     */
    public get State() {
        return this._State;
    }

    /**
     *  Get the StateChanged event used to monitor changes to the state of the Digitizer.
     */
    public get StateChangedEvent() {
        return this._StateChangedEvent;
    }

    /**
     * Create a new instance of the Digitizer.
     * @param sampleSize - Size of each sample in bytes.
     * @param sampleCount - Number of samples to read from the ADC.
     */
    constructor(sampleSize: ByteCount, sampleCount: number) {
        this._SampleSize = sampleSize;
        this._SampleCount = sampleCount;

        this._State = DigitizerState.InitializationComplete;
    }

    /**
     * Performs reset of the Digitizer.
     * @returns Promise that resolves to true when the reset is successful, otherwise false.
     */
    public abstract Reset(): Promise<boolean>;

    /**
     * Reads samples from ADC for two channels.
     * @param channels - Array of at least two Int16Arrays used to store the samples for each of the two channels.
     * @returns Promise that resolves to true when the samples are read successfully, otherwise false.
     */
    public abstract ReadSamples(channels: Int16Array[]): Promise<boolean>;

    /**
     * Updates the current state of the Digitizer and dispatches the StateChangedEvent.
     * @param newState - The new state of the Digitizer.
     */
    protected UpdateState(newState: DigitizerState) {
        if (newState !== this._State) {
            const previousState: DigitizerState = this._State;
            this._State = newState;

            this._StateChangedEvent.emit({
                sender: this,
                newState: this._State,
                previousState: previousState
            });
        }
    }
}
