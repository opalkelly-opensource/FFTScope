/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, ReactNode } from "react";

import { WorkQueue, ByteCount, IFPGADataPortClassic } from "@opalkelly/frontpanel-platform-api";

import * as Switch from "@radix-ui/react-switch";

import { Subscription } from "sub-events";

import "./DigitalSignalSamplerView.css";

import {
    DigitalSignalSampler,
    DigitalSignalSamplerState,
    DigitalSignalSamplerStateChangeEventArgs
} from "./DigitalSignalSampler";

import ToggleComponent from "./ToggleComponent";

/**
 * Event handler for the SampleChannelsUpdate event.
 */
export type SampleChannelsUpdateEventHandler = (sampleChannels: Int16Array[]) => Promise<void>;
export type ChannelEnableStateChangeHandler = (channelIndex: number, checked: boolean | 'indeterminate') => void;

/**
 * Digital Signal Sampler View Properties
 */
interface DigitalSignalSamplerViewProps {
    label: string;
    fpgaDataPort: IFPGADataPortClassic;
    workQueue: WorkQueue;
    sampleSize: ByteCount;
    sampleCount: number;
    updatePeriodMilliseconds: number;
    onSampleChannelsUpdate: SampleChannelsUpdateEventHandler;
    channelEnableStates: boolean[];
    channelEnableStateChange: ChannelEnableStateChangeHandler;
    channelColors: string[];
}

/**
 * Digital Signal Sampler View State
 */
interface DigitalSignalSamplerViewState {
    isOperationPending: boolean;
    isUpdateTimerEnabled: boolean;
}

/**
 * Digital Signal Sampler view component used to display the output of a Digital Signal Sampler.
 */
class DigitalSignalSamplerView extends Component<
    DigitalSignalSamplerViewProps,
    DigitalSignalSamplerViewState
> {
    private readonly _Sampler: DigitalSignalSampler;

    private readonly _SampleChannels: Int16Array[];

    private _SamplerStateChangeEventSubscription: Subscription | null = null;

    protected get WorkQueue(): WorkQueue {
        return this.props.workQueue;
    }

    constructor(props: DigitalSignalSamplerViewProps) {
        super(props);

        // Create Digital Signal Sampler
        this._Sampler = new DigitalSignalSampler(props.fpgaDataPort, props.sampleSize, props.sampleCount);

        // Creates an array of two Int16Array objects one for each of the two channels available.
        this._SampleChannels = new Array(2);

        this._SampleChannels[0] = new Int16Array(this._Sampler.SampleCount);
        this._SampleChannels[1] = new Int16Array(this._Sampler.SampleCount);

        // Set the initial state of the component
        this.state = {
            isOperationPending: false,
            isUpdateTimerEnabled: false,
        };
    }

    componentDidMount(): void {
        this.setState({
            isOperationPending:
                this._Sampler.State === DigitalSignalSamplerState.InitializePending ||
                this._Sampler.State === DigitalSignalSamplerState.ResetPending
        });

        this._SamplerStateChangeEventSubscription = this._Sampler.StateChangedEvent.subscribe(
            this.OnSamplerStateChange.bind(this)
        );

        this.OnReset();
    }

    componentWillUnmount(): void {
        this.setState({ isUpdateTimerEnabled: false });

        this._SamplerStateChangeEventSubscription?.cancel();
    }

    componentDidUpdate(prevProps: DigitalSignalSamplerViewProps, prevState: DigitalSignalSamplerViewState): void {
        if ((this.state.isUpdateTimerEnabled !== prevState.isUpdateTimerEnabled) && this.state.isUpdateTimerEnabled)
        {
            this.UpdateSampleChannelsLoop();
        }
    }

    render(): ReactNode {
        return (
            <div className="okDigitalSignalSampler">
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
                <div className="okDigitalSignalSamplerControlPanel">
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
     * @returns Promise that resolves when the Digital Signal Sampler has been reset.
     */
    private async OnReset(): Promise<void> {
        await this.WorkQueue.post(async () => {
            await this._Sampler.Reset();
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
     * Loop that periodically reads and stores samples from the Digital Signal Sampler.
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
     * Reads samples from the Digital Signal Sampler and stores them.
     * @returns Promise that resolves when the new samples have been retrieved and stored.
     */
    private async UpdateSampleChannels(): Promise<void> {
        await this.WorkQueue.post(async () => {
            await this._Sampler.ReadSamples(this._SampleChannels);
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
     * Event handler used to monitor the state of the Digital Signal Sampler.
     * @param args - Event arguments detailing the state transition.
     */
    private OnSamplerStateChange(args: DigitalSignalSamplerStateChangeEventArgs): void {
        this.setState({
            isOperationPending:
                args.newState === DigitalSignalSamplerState.InitializePending ||
                args.newState === DigitalSignalSamplerState.ResetPending
        });

        console.log("Sampler State: " + args.previousState + " => " + args.newState);
    }
}

export default DigitalSignalSamplerView;
