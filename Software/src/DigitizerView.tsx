/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, ReactNode } from "react";

import * as Switch from "@radix-ui/react-switch";

import { Subscription } from "sub-events";

import "./DigitizerView.css";

import {
    DigitizerDriver,
    DigitizerState,
    DigitizerStateChangeEventArgs
} from "./DigitizerDriver";

import ToggleComponent from "./ToggleComponent";

/**
 * Digitizer View Properties
 *
 * The View is purely presentational. App.tsx owns the captured-sample
 * buffers, the continuous capture loop, and the shared handlers that
 * UI controls and the matching MCP tools both call.
 */
interface DigitizerViewProps {
    label: string;
    driver: DigitizerDriver;
    channelEnableStates: boolean[];
    onChannelEnableStateChange: (channelIndex: number, enabled: boolean) => void;
    channelColors: string[];
    continuousEnabled: boolean;
    onContinuousChange: (enabled: boolean) => void;
    onCaptureOnce: () => void;
    onReset: () => void;
}

interface DigitizerViewState {
    isOperationPending: boolean;
}

/**
 * Digitizer view component used to display the controls of a Digitizer.
 */
class DigitizerView extends Component<DigitizerViewProps, DigitizerViewState> {
    private _DigitizerStateChangeEventSubscription: Subscription | null = null;

    constructor(props: DigitizerViewProps) {
        super(props);

        this.state = {
            isOperationPending: false
        };
    }

    componentDidMount(): void {
        this.setState({
            isOperationPending:
                this.props.driver.State === DigitizerState.InitializePending ||
                this.props.driver.State === DigitizerState.ResetPending
        });

        this._DigitizerStateChangeEventSubscription = this.props.driver.StateChangedEvent.subscribe(
            this.OnDigitizerStateChange.bind(this)
        );
    }

    componentWillUnmount(): void {
        this._DigitizerStateChangeEventSubscription?.cancel();
    }

    componentDidUpdate(prevProps: DigitizerViewProps): void {
        // Re-subscribe when the driver instance swaps (StrictMode, reconnect).
        if (prevProps.driver !== this.props.driver) {
            this._DigitizerStateChangeEventSubscription?.cancel();
            this._DigitizerStateChangeEventSubscription = this.props.driver.StateChangedEvent.subscribe(
                this.OnDigitizerStateChange.bind(this)
            );
        }
    }

    render(): ReactNode {
        return (
            <div className="okDigitizer">
                <div className="okChannelSelectorPanel">
                    <ToggleComponent
                        label="Channel 1"
                        color={this.props.channelColors[0]}
                        toggleState={this.props.channelEnableStates[0]}
                        onToggleStateChange={(checked) => this.handleChannelCheckChange(0, checked)}
                    />
                    <ToggleComponent
                        label="Channel 2"
                        color={this.props.channelColors[1]}
                        toggleState={this.props.channelEnableStates[1]}
                        onToggleStateChange={(checked) => this.handleChannelCheckChange(1, checked)}
                    />
                </div>
                <div className="okDigitizerControlPanel">
                    <div className="okSwitchContainer">
                        <Switch.Root
                            className="okSwitchRoot"
                            checked={this.props.continuousEnabled}
                            onCheckedChange={(checked) => this.props.onContinuousChange(checked)}
                            disabled={this.state.isOperationPending}
                        >
                            <Switch.Thumb className="okSwitchThumb" />
                        </Switch.Root>
                        <span className="okSwitchLabel">Continuous</span>
                    </div>
                    <button
                        className="okButton"
                        onMouseDown={() => this.props.onCaptureOnce()}
                        disabled={this.state.isOperationPending}
                    >
                        Capture
                    </button>
                    <button
                        className="okButton"
                        onMouseDown={() => this.props.onReset()}
                        disabled={this.state.isOperationPending}
                    >
                        Reset
                    </button>
                </div>
            </div>
        );
    }

    private handleChannelCheckChange(channelIndex: number, checked: boolean | 'indeterminate'): void {
        this.props.onChannelEnableStateChange(channelIndex, checked === true);
    }

    private OnDigitizerStateChange(args: DigitizerStateChangeEventArgs): void {
        this.setState({
            isOperationPending:
                args.newState === DigitizerState.InitializePending ||
                args.newState === DigitizerState.ResetPending
        });

        console.log("Digitizer State: " + args.previousState + " => " + args.newState);
    }
}

export default DigitizerView;
