/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, ReactNode } from "react";

import { WorkQueue } from "@opalkelly/frontpanel-platform-api";

import * as Switch from "@radix-ui/react-switch";

import { Subscription } from "sub-events";

import "./DigitizerView.css";

import { ADCState, ADCStateChangeEventArgs } from "./ADCDriver";
import { CaptureSequencer } from "./CaptureSequencer";

import ToggleComponent from "./ToggleComponent";

export type SampleChannelsUpdateEventHandler = (sampleChannels: Int16Array[]) => Promise<void>;
export type ChannelEnableStateChangeHandler = (channelIndex: number, checked: boolean | 'indeterminate') => void;

interface DigitizerViewProps {
    label: string;
    sequencer: CaptureSequencer;
    workQueue: WorkQueue;
    updatePeriodMilliseconds: number;
    onSampleChannelsUpdate: SampleChannelsUpdateEventHandler;
    channelEnableStates: boolean[];
    channelEnableStateChange: ChannelEnableStateChangeHandler;
    isContinuous: boolean;
    onContinuousChange: (enabled: boolean) => void;
    onReset: () => Promise<boolean>;
    channelColors: string[];
}

interface DigitizerViewState {
    isOperationPending: boolean;
}

/**
 * Digitizer view component used to drive and display ADC captures.
 */
class DigitizerView extends Component<
    DigitizerViewProps,
    DigitizerViewState
> {
    private readonly _SampleChannels: Int16Array[];

    private _ADCStateChangeEventSubscription: Subscription | null = null;

    private _PollActive = false;
    private _PollRunning = false;

    protected get WorkQueue(): WorkQueue {
        return this.props.workQueue;
    }

    constructor(props: DigitizerViewProps) {
        super(props);

        this._SampleChannels = new Array(2);

        this._SampleChannels[0] = new Int16Array(this.props.sequencer.SampleCount);
        this._SampleChannels[1] = new Int16Array(this.props.sequencer.SampleCount);

        this.state = {
            isOperationPending: false
        };
    }

    componentDidMount(): void {
        this.setState({
            isOperationPending: this.props.sequencer.State === ADCState.ResetPending
        });

        this._ADCStateChangeEventSubscription = this.props.sequencer.StateChangedEvent.subscribe(
            this.OnADCStateChange.bind(this)
        );

        if (this.props.isContinuous) {
            this.StartPollLoop();
        }
    }

    componentWillUnmount(): void {
        this.StopPollLoop();

        this._ADCStateChangeEventSubscription?.cancel();
    }

    componentDidUpdate(prevProps: DigitizerViewProps): void {
        // Re-subscribe when the sequencer instance swaps.
        if (prevProps.sequencer !== this.props.sequencer) {
            this._ADCStateChangeEventSubscription?.cancel();
            this._ADCStateChangeEventSubscription = this.props.sequencer.StateChangedEvent.subscribe(
                this.OnADCStateChange.bind(this)
            );
        }
        if (this.props.isContinuous !== prevProps.isContinuous) {
            if (this.props.isContinuous) {
                this.StartPollLoop();
            } else {
                this.StopPollLoop();
            }
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
                        onToggleStateChange={(checked) => this.props.channelEnableStateChange(0, checked)}
                    />
                    <ToggleComponent
                        label="Channel 2"
                        color={this.props.channelColors[1]}
                        toggleState={this.props.channelEnableStates[1]}
                        onToggleStateChange={(checked) => this.props.channelEnableStateChange(1, checked)}
                    />
                </div>
                <div className="okDigitizerControlPanel">
                    <div className="okSwitchContainer">
                        <Switch.Root
                            className="okSwitchRoot"
                            checked={this.props.isContinuous}
                            onCheckedChange={this.props.onContinuousChange}
                            disabled={this.state.isOperationPending}
                        >
                            <Switch.Thumb className="okSwitchThumb" />
                        </Switch.Root>
                        <span className="okSwitchLabel">Continuous</span>
                    </div>
                    <button
                        className="okButton"
                        onMouseDown={this.OnCapture.bind(this)}
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

    private OnCapture(): void {
        this.UpdateSampleChannels().catch((error) => {
            console.error(`Failed to Update Sample Channels: \n${error}`);
        });
    }

    private OnReset(): void {
        this.props.onReset().catch((error) => {
            console.error(`Failed to Reset ADC: \n${error}`);
        });
    }

    /** Request continuous capture. */
    private StartPollLoop(): void {
        this._PollActive = true;

        if (this._PollRunning) {
            return;
        }

        this._PollRunning = true;
        void this.UpdateSampleChannelsLoop();
    }

    /** Stop continuous capture. An in-flight capture is not cancelled. */
    private StopPollLoop(): void {
        this._PollActive = false;
    }

    /** Loop that periodically reads and stores samples from the ADC. */
    private async UpdateSampleChannelsLoop(): Promise<void> {
        const start: number = performance.now();

        try {
            await this.UpdateSampleChannels();
        } catch (error) {
            // A capture_done timeout throws from either the sample or the
            // spectrum path. Keep polling.
            console.error(`Failed to Update Sample Channels: \n${error}`);
        }

        const elapsed: number = performance.now() - start;

        if (!this._PollActive) {
            this._PollRunning = false;
            return;
        }

        const delay: number = this.props.updatePeriodMilliseconds - elapsed;

        setTimeout(
            () => {
                if (!this._PollActive) {
                    this._PollRunning = false;
                    return;
                }
                void this.UpdateSampleChannelsLoop();
            },
            // At least 10 ms between captures, even when one overruns the period.
            delay > 10 ? delay : 10
        );
    }

    /**
     * Capture one frame and publish it. A declined capture leaves the previous
     * frame in the buffers, so nothing is published.
     */
    private async UpdateSampleChannels(): Promise<void> {
        let isCaptured = false;

        await this.WorkQueue.post(async () => {
            isCaptured = await this.props.sequencer.ReadSamples(this._SampleChannels);
        });

        if (!isCaptured) {
            console.error("Failed to Read Samples from ADC: the ADC is not reset.");
            return;
        }

        return this.props.onSampleChannelsUpdate(this._SampleChannels);
    }

    /**
     * Event handler used to monitor the state of the ADC.
     * @param args - Event arguments detailing the state transition.
     */
    private OnADCStateChange(args: ADCStateChangeEventArgs): void {
        this.setState({
            isOperationPending: args.newState === ADCState.ResetPending
        });

        console.log("ADC State: " + args.previousState + " => " + args.newState);
    }
}

export default DigitizerView;
