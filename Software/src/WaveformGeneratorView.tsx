/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, ReactNode } from "react";

import * as Popover from "@radix-ui/react-popover";
import * as Switch from "@radix-ui/react-switch";

import "./WaveformGeneratorView.css";

import FrequencyVectorView from "./FrequencyVectorView";

import FrequencyVectorEditView from "./FrequencyVectorEditView";

import {
    WaveformGeneratorDriver,
    WaveformGeneratorState,
    WaveformGeneratorStateChangeEventArgs
} from "./WaveformGeneratorDriver";

import { WaveformGeneratorAdapter, FrequencyVector } from "./WaveformGeneratorAdapter";

import { WorkQueue } from "@opalkelly/frontpanel-platform-api";

import { Subscription } from "sub-events";

/**
 * Type representing the state of a Frequency Vector.
 */
type FrequencyVectorState = {
    vector: FrequencyVector;
    isEnabled: boolean;
};

/**
 * Waveform Generator View Properties
 */
interface WaveformGeneratorViewProps {
    label: string;
    driver: WaveformGeneratorDriver;
    workQueue: WorkQueue;
}

/**
 * Waveform Generator View State
 */
interface WaveformGeneratorViewState {
    frequencyVectors: FrequencyVectorState[];
    isAutoScaleEnabled: boolean;
    isOperationPending: boolean;
    amplitudeScaleFactor: number;
}

/**
 * Waveform Generator View component used to configure the Waveform Generator.
 */
class WaveformGeneratorView extends Component<
    WaveformGeneratorViewProps,
    WaveformGeneratorViewState
> {
    private _WaveformGeneratorAdapter: WaveformGeneratorAdapter;

    private _WaveformGeneratorStateChangeEventSubscription: Subscription | null = null;

    protected get WorkQueue(): WorkQueue {
        return this.props.workQueue;
    }

    constructor(props: WaveformGeneratorViewProps) {
        super(props);

        this._WaveformGeneratorAdapter = new WaveformGeneratorAdapter(this.props.driver);

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
                this.props.driver.State === WaveformGeneratorState.InitializePending ||
                this.props.driver.State === WaveformGeneratorState.ResetPending
        });

        this._WaveformGeneratorStateChangeEventSubscription =
            this.props.driver.StatechangedEvent.subscribe(
                this.OnWaveformGeneratorStateChange.bind(this)
            );

        this.Initialize();
    }

    componentWillUnmount(): void {
        this._WaveformGeneratorStateChangeEventSubscription?.cancel();
    }

    componentDidUpdate(prevProps: WaveformGeneratorViewProps): void {
        // Re-bind when the driver instance swaps (StrictMode, reconnect).
        if (prevProps.driver !== this.props.driver) {
            this._WaveformGeneratorStateChangeEventSubscription?.cancel();
            this._WaveformGeneratorAdapter = new WaveformGeneratorAdapter(this.props.driver);
            this._WaveformGeneratorStateChangeEventSubscription =
                this.props.driver.StatechangedEvent.subscribe(
                    this.OnWaveformGeneratorStateChange.bind(this)
                );
            this.Initialize();
        }
    }

    render(): ReactNode {
        const initializeButton: ReactNode = (this.props.driver.State ===
            WaveformGeneratorState.InitializationFailed ||
            this.props.driver.State === WaveformGeneratorState.Initial) ?? (
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
            <div className="okWaveformGenerator">
                <div className="okWaveformGeneratorControlPanel">
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
                <div className="okWaveformGeneratorContentPanel">
                    {this.state.frequencyVectors.map((item, i) => (
                        <Popover.Root key={`FrequencyVector[${i}]`}>
                            <Popover.Trigger asChild>
                                <button className="okFrequencyVectorItem" data-state={item.isEnabled ? 'on' : 'off'}>
                                    <FrequencyVectorView
                                        frequency={this.props.driver.FFTConfiguration.GetBinFrequency(
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
                                        frequency={this.props.driver.FFTConfiguration.GetBinFrequency(
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
     * Initialize the Waveform Generator.
     * @returns A Promise that resolves when the Waveform Generator has been initialized.
     */
    public async Initialize(): Promise<void> {
        // Driver init/reset happens in App.tsx; just push the saved vectors.

        // Retrieve the set of enabled Frequency Vectors
        const vectors: FrequencyVector[] = this.state.frequencyVectors
            .filter((value) => value.isEnabled)
            .map((value) => value.vector);

        // Add the Frequency Vectors to the Waveform Generator
        vectors.forEach((vector: FrequencyVector) =>
            this._WaveformGeneratorAdapter.AddFrequencyVector(vector)
        );

        // Update the Waveform Generator Frequency Bins
        const start: number = performance.now();

        await this.WorkQueue.post(async () => {
            await this._WaveformGeneratorAdapter.UpdateFrequencyBins(false);
        });

        const elapsed: number = performance.now() - start;

        console.log("Initialize Frequency Bins ElapsedTime=" + elapsed + "ms");
    }

    /**
     * Reset the Waveform Generator.
     * @returns A Promise that resolves when the Waveform Generator has been reset.
     */
    public async Reset(): Promise<void> {
        await this.WorkQueue.post(async () => {
            await this._WaveformGeneratorAdapter.Reset();
        });

        // Reset the state of all the Frequency Vectors
        this.setState((previousState: WaveformGeneratorViewState) => {
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
     * Adds or removes a Frequency Vector from the output of the waveform generator based
     * on the specified isEnabled flag.
     * @param vector - Frequency Vector to add or remove from the output of the waveform generator.
     * @param isEnabled - Flag indicating whether the Frequency Vector should be added or removed.
     * @returns A Promise that resolves when the Frequency Vector has been added or removed.
     */
    private async EnableFrequencyVector(
        vector: FrequencyVector,
        isEnabled: boolean
    ): Promise<void> {
        let amplitudeScaleFactor: number = this._WaveformGeneratorAdapter.AmplitudeScaleFactor;

        await this.WorkQueue.post(async () => {
            if (isEnabled) {
                this._WaveformGeneratorAdapter.AddFrequencyVector(vector);
            } else {
                await this._WaveformGeneratorAdapter.RemoveFrequencyVector(vector);
            }

            amplitudeScaleFactor = await this._WaveformGeneratorAdapter.UpdateFrequencyBins(
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
        let amplitudeScaleFactor: number = this._WaveformGeneratorAdapter.AmplitudeScaleFactor;

        await this.WorkQueue.post(async () => {
            await this._WaveformGeneratorAdapter.RemoveFrequencyVector(previousVector);

            this._WaveformGeneratorAdapter.AddFrequencyVector(newVector);

            amplitudeScaleFactor = await this._WaveformGeneratorAdapter.UpdateFrequencyBins(
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
        this.setState((previousState: WaveformGeneratorViewState) => {
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
        this.setState((previousState: WaveformGeneratorViewState) => {
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
     * Event handler that is called when the state of the Waveform Generator changes.
     * @param args - Event arguments containing the previous and new state of the Waveform Generator.
     */
    private OnWaveformGeneratorStateChange(args: WaveformGeneratorStateChangeEventArgs): void {
        this.setState({
            isOperationPending:
                args.newState === WaveformGeneratorState.InitializePending ||
                args.newState === WaveformGeneratorState.ResetPending
        });

        console.log("WaveformGenerator State: " + args.previousState + " => " + args.newState);
    }

    /**
     * Event handler that is called when the AutoScale state changes.
     * @param state - New state of the AutoScale switch.
     */
    private async OnUpdateAutoScaleChange(checked: boolean): Promise<void> {
        let amplitudeScaleFactor: number = this._WaveformGeneratorAdapter.AmplitudeScaleFactor;

        await this.WorkQueue.post(async () => {
            amplitudeScaleFactor = await this._WaveformGeneratorAdapter.UpdateFrequencyBins(checked);
        });

        this.setState({
            isAutoScaleEnabled: checked,
            amplitudeScaleFactor: amplitudeScaleFactor
        });
    }
}

export default WaveformGeneratorView;
