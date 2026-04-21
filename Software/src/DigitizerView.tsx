/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, ReactNode } from "react";

import { WorkQueue } from "@opalkelly/frontpanel-platform-api";

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
 * Event handler for the SampleChannelsUpdate event.
 */
export type SampleChannelsUpdateEventHandler = (sampleChannels: Int16Array[]) => Promise<void>;
export type ChannelEnableStateChangeHandler = (channelIndex: number, checked: boolean | 'indeterminate') => void;

/**
 * Digitizer View Properties
 */
interface DigitizerViewProps {
    label: string;
    driver: DigitizerDriver;
    workQueue: WorkQueue;
    updatePeriodMilliseconds: number;
    onSampleChannelsUpdate: SampleChannelsUpdateEventHandler;
    channelEnableStates: boolean[];
    channelEnableStateChange: ChannelEnableStateChangeHandler;
    channelColors: string[];
}

/**
 * Digitizer View State
 */
interface DigitizerViewState {
    isOperationPending: boolean;
    isUpdateTimerEnabled: boolean;
}

/**
 * Digitizer view component used to display the output of a Digitizer.
 */
class DigitizerView extends Component<
    DigitizerViewProps,
    DigitizerViewState
> {
    private readonly _SampleChannels: Int16Array[];

    private _DigitizerStateChangeEventSubscription: Subscription | null = null;

    protected get WorkQueue(): WorkQueue {
        return this.props.workQueue;
    }

    constructor(props: DigitizerViewProps) {
        super(props);

        // Creates an array of two Int16Array objects one for each of the two channels available.
        this._SampleChannels = new Array(2);

        this._SampleChannels[0] = new Int16Array(this.props.driver.SampleCount);
        this._SampleChannels[1] = new Int16Array(this.props.driver.SampleCount);

        // Set the initial state of the component
        this.state = {
            isOperationPending: false,
            isUpdateTimerEnabled: false,
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

        this.setState({ isUpdateTimerEnabled: true });
    }

    componentWillUnmount(): void {
        this.setState({ isUpdateTimerEnabled: false });

        this._DigitizerStateChangeEventSubscription?.cancel();
    }

    componentDidUpdate(prevProps: DigitizerViewProps, prevState: DigitizerViewState): void {
        // Re-subscribe when the driver instance swaps (StrictMode, reconnect).
        if (prevProps.driver !== this.props.driver) {
            this._DigitizerStateChangeEventSubscription?.cancel();
            this._DigitizerStateChangeEventSubscription = this.props.driver.StateChangedEvent.subscribe(
                this.OnDigitizerStateChange.bind(this)
            );
        }
        if ((this.state.isUpdateTimerEnabled !== prevState.isUpdateTimerEnabled) && this.state.isUpdateTimerEnabled)
        {
            this.UpdateSampleChannelsLoop();
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
                            checked={this.state.isUpdateTimerEnabled} 
                            onCheckedChange={this.OnToggleUpdateTimer.bind(this)}
                            disabled={this.state.isOperationPending}
                        >
                            <Switch.Thumb className="okSwitchThumb" />
                        </Switch.Root>
                        <span className="okSwitchLabel">Continuous</span>
                    </div>
                    <button
                        className="okButton"
                        onMouseDown={this.UpdateSampleChannels.bind(this)}
                        disabled={this.state.isOperationPending}
                    >
                        Capture
                    </button>
                    <button
                        className="okButton"
                        onMouseDown={this.OnReset.bind(this)}
                        disabled={this.state.isOperationPending}
                    >
                        Reset
                    </button>
                </div>
            </div>
        );
    }

    /**
     * Event handler for the Resetting.
     * @returns Promise that resolves when the Digitizer has been reset.
     */
    private async OnReset(): Promise<void> {
        await this.WorkQueue.post(async () => {
            await this.props.driver.Reset();
        });

        // Start the periodic update timer if it is not already running.
        if (!this.state.isUpdateTimerEnabled) {
            this.OnToggleUpdateTimer(true);
        }
    }

    /**
     * Event handler for the Starting and Stoping the periodic update timer.
     * @param state - New state of the ToggleSwitch.
     */
    private OnToggleUpdateTimer(checked: boolean) {
        this.setState({ isUpdateTimerEnabled: checked });
    }

    /**
     * Loop that periodically reads and stores samples from the Digitizer.
     */
    private async UpdateSampleChannelsLoop(): Promise<void> {
        const start: number = performance.now();

        await this.UpdateSampleChannels();

        const elapsed: number = performance.now() - start;

        if (this.state.isUpdateTimerEnabled) {
            const delay: number = this.props.updatePeriodMilliseconds - elapsed;

            setTimeout(
                async () => {
                    await this.UpdateSampleChannelsLoop();
                },
                delay > 10 ? delay : 10
            );
        }
    }

    /**
     * Reads samples from the Digitizer and stores them.
     * @returns Promise that resolves when the new samples have been retrieved and stored.
     */
    private async UpdateSampleChannels(): Promise<void> {
        await this.WorkQueue.post(async () => {
            try {
                await this.props.driver.ReadSamples(this._SampleChannels);
            }
            catch(error) {
                console.error(`Failed to Read Samples from Digitizer: \n${error}`);
            }
        });

        return this.props.onSampleChannelsUpdate(this._SampleChannels);
    }

    /**
     * Event handler for channel checkbox state changes.
     * @param channelIndex - Index of the channel (0 for Channel 1, 1 for Channel 2).
     * @param checked - New checked state.
     */
    private handleChannelCheckChange(channelIndex: number, checked: boolean | 'indeterminate'): void {
        this.props.channelEnableStateChange(channelIndex, checked);
    }

    /**
     * Event handler used to monitor the state of the Digitizer.
     * @param args - Event arguments detailing the state transition.
     */
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
