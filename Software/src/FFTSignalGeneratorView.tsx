/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, ReactNode } from "react";

import * as Popover from "@radix-ui/react-popover";
import * as Switch from "@radix-ui/react-switch";

import "./FFTSignalGeneratorView.css";

import FrequencyVectorView from "./FrequencyVectorView";

import FrequencyVectorEditView from "./FrequencyVectorEditView";

import FFTConfiguration from "./FFTConfiguration";

import {
    FFTSignalGenerator,
    FFTSignalGeneratorState,
    FFTSignalGeneratorStateChangeEventArgs
} from "./FFTSignalGenerator";

import { FFTSignalGeneratorAdapter, FrequencyVector } from "./FFTSignalGeneratorAdapter";

import { IFPGADataPortClassic, WorkQueue } from "@opalkelly/frontpanel-platform-api";

import { Subscription } from "sub-events";

/**
 * Type representing the state of a Frequency Vector.
 */
type FrequencyVectorState = {
    vector: FrequencyVector;
    isEnabled: boolean;
};

/**
 * FFT Signal Generator View Properties
 */
interface FFTSignalGeneratorViewProps {
    label: string;
    fpgaDataPort: IFPGADataPortClassic;
    workQueue: WorkQueue;
}

/**
 * FFT Signal Generator View State
 */
interface FFTSignalGeneratorViewState {
    frequencyVectors: FrequencyVectorState[];
    isAutoScaleEnabled: boolean;
    isOperationPending: boolean;
    amplitudeScaleFactor: number;
}

/**
 * FFT Signal Generator View component used to configure the FFT Signal Generator.
 */
class FFTSignalGeneratorView extends Component<
    FFTSignalGeneratorViewProps,
    FFTSignalGeneratorViewState
> {
    private readonly _SignalGenerator: FFTSignalGenerator;
    private readonly _SignalGeneratorAdapter: FFTSignalGeneratorAdapter;

    private _SignalGeneratorStateChangeEventSubscription: Subscription | null = null;

    protected get WorkQueue(): WorkQueue {
        return this.props.workQueue;
    }

    constructor(props: FFTSignalGeneratorViewProps) {
        super(props);

        // Create FFT Signal Generator
        const fftLength = 1024; // 1024 bin FFT Length
        const sampleRate = 125000000; // 125MHz Sample Rate
        const maxAmplitudeValue = 0x1fffff;

        const fftConfiguration = new FFTConfiguration(fftLength, sampleRate, maxAmplitudeValue);
        const retryCount = 100;

        this._SignalGenerator = new FFTSignalGenerator(
            props.fpgaDataPort,
            fftConfiguration,
            retryCount
        );
        this._SignalGeneratorAdapter = new FFTSignalGeneratorAdapter(this._SignalGenerator);

        // Set Initial State
        const frequencyVectors: FrequencyVectorState[] = [];

        frequencyVectors.push({ isEnabled: true, vector: { bin: 68, amplitude: -24 } });
        frequencyVectors.push({ isEnabled: true, vector: { bin: 2, amplitude: -7 } });
        frequencyVectors.push({ isEnabled: true, vector: { bin: 18, amplitude: -28 } });
        frequencyVectors.push({ isEnabled: false, vector: { bin: 1, amplitude: 0 } });
        frequencyVectors.push({ isEnabled: false, vector: { bin: 1, amplitude: 0 } });
        frequencyVectors.push({ isEnabled: false, vector: { bin: 1, amplitude: 0 } });
        frequencyVectors.push({ isEnabled: false, vector: { bin: 1, amplitude: 0 } });
        frequencyVectors.push({ isEnabled: false, vector: { bin: 1, amplitude: 0 } });

        this.state = {
            frequencyVectors: frequencyVectors,
            isAutoScaleEnabled: true,
            isOperationPending: false,
            amplitudeScaleFactor: 1.0
        };
    }

    componentDidMount(): void {
        this.setState({
            isOperationPending:
                this._SignalGenerator.State === FFTSignalGeneratorState.InitializePending ||
                this._SignalGenerator.State === FFTSignalGeneratorState.ResetPending
        });

        this._SignalGeneratorStateChangeEventSubscription =
            this._SignalGenerator.StatechangedEvent.subscribe(
                this.OnSignalGeneratorStateChange.bind(this)
            );

        this.Initialize();
    }

    componentWillUnmount(): void {
        this._SignalGeneratorStateChangeEventSubscription?.cancel();
    }

    render(): ReactNode {
        const initializeButton: ReactNode = (this._SignalGenerator.State ===
            FFTSignalGeneratorState.InitializationFailed ||
            this._SignalGenerator.State === FFTSignalGeneratorState.Initial) ?? (
            <button
                className="okButton"
                onMouseDown={this.Initialize.bind(this)}
                disabled={this.state.isOperationPending}
            >
                Initialize
            </button>
        );

        const autoscaleText: string =
            "Autoscale " + this.FormatDecibelString(this.state.amplitudeScaleFactor);
        return (
            <div className="okSignalGenerator">
                <div className="okSignalGeneratorControlPanel">
                    {initializeButton}
                    <button
                        className="okButton"
                        onMouseDown={this.Reset.bind(this)}
                        disabled={this.state.isOperationPending}
                    >
                        Reset Instrument
                    </button>
                    <div className="okSwitchContainer">
                        <Switch.Root className="okSwitchRoot" checked={this.state.isAutoScaleEnabled} onCheckedChange={this.OnUpdateAutoScaleChange.bind(this)}>
                            <Switch.Thumb className="okSwitchThumb" />
                        </Switch.Root>
                        <span className="okSwitchLabel">{autoscaleText}</span>
                    </div>
                </div>
                <div className="okSignalGeneratorContentPanel">
                    {this.state.frequencyVectors.map((item, i) => (
                        <Popover.Root key={`FrequencyVector[${i}]`}>
                            <Popover.Trigger asChild>
                                <button className="okFrequencyVectorItem" data-state={item.isEnabled ? 'on' : 'off'}>
                                    <FrequencyVectorView
                                        frequency={this._SignalGenerator.FFTConfiguration.GetBinFrequency(
                                            item.vector.bin
                                        )}
                                        vector={item.vector}
                                    />
                                </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                                <Popover.Content side="right" sideOffset={15}>
                                    <FrequencyVectorEditView
                                        id={i}
                                        frequency={this._SignalGenerator.FFTConfiguration.GetBinFrequency(
                                            item.vector.bin
                                        )}
                                        vector={item.vector}
                                        onVectorChange={this.OnFrequencyVectorChange.bind(this)}
                                        enabled={item.isEnabled}
                                        onEnabledChange={this.OnFrequencyVectorIsEnabledChange.bind(this)}
                                    />
                                </Popover.Content>
                            </Popover.Portal>
                        </Popover.Root>
                    ))}
                </div>
            </div>
        );
    }

    /**
     * Initialize the FFT Signal Generator.
     * @returns A Promise that resolves when the FFT Signal Generator has been initialized.
     */
    public async Initialize(): Promise<void> {
        await this.WorkQueue.post(async () => {
            await this._SignalGenerator.Initialize();

            await this._SignalGenerator.Reset();
        });

        // Retrieve the set of enabled Frequency Vectors
        const vectors: FrequencyVector[] = this.state.frequencyVectors
            .filter((value) => value.isEnabled)
            .map((value) => value.vector);

        // Add the Frequency Vectors to the Signal Generator
        vectors.forEach((vector: FrequencyVector) =>
            this._SignalGeneratorAdapter.AddFrequencyVector(vector)
        );

        // Update the Signal Generator Frequency Bins
        const start: number = performance.now();

        await this.WorkQueue.post(async () => {
            await this._SignalGeneratorAdapter.UpdateFrequencyBins(false);
        });

        const elapsed: number = performance.now() - start;

        console.log("Initialize Frequency Bins ElapsedTime=" + elapsed + "ms");
    }

    /**
     * Reset the FFT Signal Generator.
     * @returns A Promise that resolves when the FFT Signal Generator has been reset.
     */
    public async Reset(): Promise<void> {
        await this.WorkQueue.post(async () => {
            await this._SignalGeneratorAdapter.Reset();
        });

        // Reset the state of all the Frequency Vectors
        this.setState((previousState: FFTSignalGeneratorViewState) => {
            const newFrequencyVectors: FrequencyVectorState[] =
                previousState.frequencyVectors.slice();

            for (let vectorIndex = 0; vectorIndex < newFrequencyVectors.length; vectorIndex++) {
                newFrequencyVectors[vectorIndex].isEnabled = false;
                newFrequencyVectors[vectorIndex].vector.bin = 0;
                newFrequencyVectors[vectorIndex].vector.amplitude = 0.0;
            }

            return { frequencyVectors: newFrequencyVectors };
        });
    }

    /**
     * Adds or removes a Frequency Vector from the output of the signal generator based
     * on the specified isEnabled flag.
     * @param vector - Frequency Vector to add or remove from the output of the signal generator.
     * @param isEnabled - Flag indicating whether the Frequency Vector should be added or removed.
     * @returns A Promise that resolves when the Frequency Vector has been added or removed.
     */
    private async EnableFrequencyVector(
        vector: FrequencyVector,
        isEnabled: boolean
    ): Promise<void> {
        let amplitudeScaleFactor: number = this._SignalGeneratorAdapter.AmplitudeScaleFactor;

        await this.WorkQueue.post(async () => {
            if (isEnabled) {
                this._SignalGeneratorAdapter.AddFrequencyVector(vector);
            } else {
                await this._SignalGeneratorAdapter.RemoveFrequencyVector(vector);
            }

            amplitudeScaleFactor = await this._SignalGeneratorAdapter.UpdateFrequencyBins(
                this.state.isAutoScaleEnabled
            );
        });

        this.setState({ amplitudeScaleFactor: amplitudeScaleFactor });
    }

    /**
     * Updates an existing Frequency Vector with a new Frequency Vector.
     * @param newVector - New Frequency Vector to update the existing Frequency Vector.
     * @param previousVector - Existing Frequency Vector to update.
     * @returns A Promise that resolves when the Frequency Vector has been updated.
     */
    private async UpdateFrequencyVector(
        newVector: FrequencyVector,
        previousVector: FrequencyVector
    ): Promise<void> {
        let amplitudeScaleFactor: number = this._SignalGeneratorAdapter.AmplitudeScaleFactor;

        await this.WorkQueue.post(async () => {
            await this._SignalGeneratorAdapter.RemoveFrequencyVector(previousVector);

            this._SignalGeneratorAdapter.AddFrequencyVector(newVector);

            amplitudeScaleFactor = await this._SignalGeneratorAdapter.UpdateFrequencyBins(
                this.state.isAutoScaleEnabled
            );
        });

        this.setState({ amplitudeScaleFactor: amplitudeScaleFactor });
    }

    /**
     * Formats the string representation of a decibel value.
     * @param value - Decibel value to format.
     * @returns String representation of the decibel value.
     */
    private FormatDecibelString(value: number): string {
        const decibelValue: number = 20.0 * Math.log10(value);

        return decibelValue.toPrecision(3) + " dB";
    }

    /**
     * Event handler that updates a Frequency Vector with a new Frequency Vector.
     * @param vectorId - Identifier of the Frequency Vector to update.
     * @param vector - New Frequency Vector to update the existing Frequency Vector.
     * @returns A Promise that resolves when the Frequency Vector has been updated.
     */
    private async OnFrequencyVectorChange(vectorId: number, vector: FrequencyVector) {
        this.setState((previousState: FFTSignalGeneratorViewState) => {
            const previousVector: FrequencyVector = previousState.frequencyVectors[vectorId].vector;

            const newFrequencyVectors: FrequencyVectorState[] =
                previousState.frequencyVectors.slice();

            newFrequencyVectors[vectorId].vector = vector;

            if (newFrequencyVectors[vectorId].isEnabled) {
                this.UpdateFrequencyVector(newFrequencyVectors[vectorId].vector, previousVector);
            }

            return { frequencyVectors: newFrequencyVectors };
        });
    }

    /**
     * Event handler that updates the isEnabled state of a Frequency Vector.
     * @param vectorId - Identifier of the Frequency Vector to update.
     * @param enabled - New state of the isEnabled flag.
     * @returns A Promise that resolves when the isEnabled state of the Frequency Vector has been updated.
     */
    private async OnFrequencyVectorIsEnabledChange(vectorId: number, enabled: boolean) {
        this.setState((previousState: FFTSignalGeneratorViewState) => {
            const newFrequencyVectors: FrequencyVectorState[] =
                previousState.frequencyVectors.slice();

            newFrequencyVectors[vectorId].isEnabled = enabled;

            this.EnableFrequencyVector(
                newFrequencyVectors[vectorId].vector,
                newFrequencyVectors[vectorId].isEnabled
            );

            return { frequencyVectors: newFrequencyVectors };
        });
    }

    /**
     * Event handler that is called when the state of the Signal Generator changes.
     * @param args - Event arguments containing the previous and new state of the Signal Generator.
     */
    private OnSignalGeneratorStateChange(args: FFTSignalGeneratorStateChangeEventArgs): void {
        this.setState({
            isOperationPending:
                args.newState === FFTSignalGeneratorState.InitializePending ||
                args.newState === FFTSignalGeneratorState.ResetPending
        });

        console.log("SignalGenerator State: " + args.previousState + " => " + args.newState);
    }

    /**
     * Event handler that is called when the AutoScale state changes.
     * @param state - New state of the AutoScale switch.
     */
    private async OnUpdateAutoScaleChange(checked: boolean): Promise<void> {
        let amplitudeScaleFactor: number = this._SignalGeneratorAdapter.AmplitudeScaleFactor;

        await this.WorkQueue.post(async () => {
            amplitudeScaleFactor = await this._SignalGeneratorAdapter.UpdateFrequencyBins(checked);
        });

        this.setState({
            isAutoScaleEnabled: checked,
            amplitudeScaleFactor: amplitudeScaleFactor
        });
    }
}

export default FFTSignalGeneratorView;
