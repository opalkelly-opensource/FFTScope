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

import { FrequencyVector } from "./WaveformGeneratorAdapter";

import { Subscription } from "sub-events";

/**
 * Type representing the state of a Frequency Vector slot.
 */
export type FrequencyVectorState = {
    vector: FrequencyVector;
    isEnabled: boolean;
};

/**
 * Waveform Generator View Properties.
 *
 * The View is purely presentational. App.tsx owns the eight-vector
 * state, the autoscale toggle, the amplitude scale factor, and the
 * WaveformGeneratorAdapter — so that UI controls and the matching MCP
 * tools both go through one shared handler per action.
 */
interface WaveformGeneratorViewProps {
    label: string;
    driver: WaveformGeneratorDriver;
    frequencyVectors: FrequencyVectorState[];
    autoscaleEnabled: boolean;
    amplitudeScaleFactor: number;
    onInitialize: () => void;
    onReset: () => void;
    onAutoscaleChange: (enabled: boolean) => void;
    onVectorChange: (vectorId: number, vector: FrequencyVector) => void;
    onVectorEnabledChange: (vectorId: number, enabled: boolean) => void;
}

interface WaveformGeneratorViewState {
    isOperationPending: boolean;
}

class WaveformGeneratorView extends Component<
    WaveformGeneratorViewProps,
    WaveformGeneratorViewState
> {
    private _StateChangeSubscription: Subscription | null = null;

    constructor(props: WaveformGeneratorViewProps) {
        super(props);

        this.state = {
            isOperationPending: false
        };
    }

    componentDidMount(): void {
        this.setState({
            isOperationPending:
                this.props.driver.State === WaveformGeneratorState.InitializePending ||
                this.props.driver.State === WaveformGeneratorState.ResetPending
        });

        this._StateChangeSubscription = this.props.driver.StatechangedEvent.subscribe(
            this.OnStateChange.bind(this)
        );
    }

    componentWillUnmount(): void {
        this._StateChangeSubscription?.cancel();
    }

    componentDidUpdate(prevProps: WaveformGeneratorViewProps): void {
        if (prevProps.driver !== this.props.driver) {
            this._StateChangeSubscription?.cancel();
            this._StateChangeSubscription = this.props.driver.StatechangedEvent.subscribe(
                this.OnStateChange.bind(this)
            );
        }
    }

    render(): ReactNode {
        const showInitializeButton =
            this.props.driver.State === WaveformGeneratorState.InitializationFailed ||
            this.props.driver.State === WaveformGeneratorState.Initial;

        const autoscaleText: string =
            "Autoscale " + this.FormatDecibelString(this.props.amplitudeScaleFactor);

        return (
            <div className="okWaveformGenerator">
                <div className="okWaveformGeneratorControlPanel">
                    {showInitializeButton && (
                        <button
                            className="okButton"
                            onMouseDown={() => this.props.onInitialize()}
                            disabled={this.state.isOperationPending}
                        >
                            Initialize
                        </button>
                    )}
                    <button
                        className="okButton"
                        onMouseDown={() => this.props.onReset()}
                        disabled={this.state.isOperationPending}
                    >
                        Reset Instrument
                    </button>
                    <div className="okSwitchContainer">
                        <Switch.Root
                            className="okSwitchRoot"
                            checked={this.props.autoscaleEnabled}
                            onCheckedChange={(checked) => this.props.onAutoscaleChange(checked)}
                        >
                            <Switch.Thumb className="okSwitchThumb" />
                        </Switch.Root>
                        <span className="okSwitchLabel">{autoscaleText}</span>
                    </div>
                </div>
                <div className="okWaveformGeneratorContentPanel">
                    {this.props.frequencyVectors.map((item, i) => (
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
                                        onVectorChange={this.props.onVectorChange}
                                        enabled={item.isEnabled}
                                        onEnabledChange={this.props.onVectorEnabledChange}
                                    />
                                </Popover.Content>
                            </Popover.Portal>
                        </Popover.Root>
                    ))}
                </div>
            </div>
        );
    }

    private FormatDecibelString(value: number): string {
        const decibelValue: number = 20.0 * Math.log10(value);
        return decibelValue.toPrecision(3) + " dB";
    }

    private OnStateChange(args: WaveformGeneratorStateChangeEventArgs): void {
        this.setState({
            isOperationPending:
                args.newState === WaveformGeneratorState.InitializePending ||
                args.newState === WaveformGeneratorState.ResetPending
        });

        console.log("WaveformGenerator State: " + args.previousState + " => " + args.newState);
    }
}

export default WaveformGeneratorView;
