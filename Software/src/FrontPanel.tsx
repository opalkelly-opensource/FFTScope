/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { Component } from "react";

import { IFPGADataPortClassic, WorkQueue } from "@opalkelly/frontpanel-platform-api";

import "./FrontPanel.css";

import FFTSignalGeneratorView from "./FFTSignalGeneratorView";
import DigitalSignalSamplerView from "./DigitalSignalSamplerView";

import DigitalSignalView from "./DigitalSignalView";
import SpectrumAnalyzerView from "./SpectrumAnalyzerView";

import Panel from "./Panel";

export interface FrontPanelProps {
    name: string;
    fpgaDataPort: IFPGADataPortClassic;
    workQueue: WorkQueue;
}

interface FrontPanelState {
    channelEnableStates: boolean[];
    channelColors: string[];
}

class FrontPanel extends Component<FrontPanelProps, FrontPanelState> {
    private readonly _DigitalSignalRef: React.RefObject<DigitalSignalView>;
    private readonly _SpectrumAnalyzerRef: React.RefObject<SpectrumAnalyzerView>;

    constructor(props: FrontPanelProps) {
        super(props);

        this._DigitalSignalRef = React.createRef();
        this._SpectrumAnalyzerRef = React.createRef();
        
        this.state = {
            channelEnableStates: [
                true, 
                true
            ],
            channelColors: [
                "#EF2424",
                "#2E7CE9",
            ]
        };
    }

    render() {
        return (
            <div className="okFrontPanel">
                <Panel title="Signal Generator">
                    <FFTSignalGeneratorView
                        label="OutputView"
                        fpgaDataPort={this.props.fpgaDataPort}
                        workQueue={this.props.workQueue}
                    />
                </Panel>
                <div className="okColumnLayoutContainer">
                    <Panel
                        title="Data Acquisition">
                        <DigitalSignalSamplerView
                            label="OutputView"
                            fpgaDataPort={this.props.fpgaDataPort}
                            workQueue={this.props.workQueue}
                            sampleSize={4}
                            sampleCount={1024}
                            updatePeriodMilliseconds={35}
                            onSampleChannelsUpdate={this.OnSampleChannelsUpdate.bind(this)}
                            channelEnableStates={this.state.channelEnableStates}
                            channelEnableStateChange={this.OnIsSampleChannelEnabledChange.bind(this)}
                            channelColors={this.state.channelColors}
                        />
                    </Panel>
                    <Panel
                        title="Time Domain"
                        className="okChartControlPanel">
                        <DigitalSignalView
                            ref={this._DigitalSignalRef}
                            label="OutputView"
                            sampleCount={1024}
                            channelColors={this.state.channelColors}
                        />
                    </Panel>
                    <Panel
                        title="Spectrum - (1,024-pt FFT)"
                        className="okChartControlPanel">
                        <SpectrumAnalyzerView
                            ref={this._SpectrumAnalyzerRef}
                            label="OutputSpectrumView"
                            channelColors={this.state.channelColors}
                            fpgaDataPort={this.props.fpgaDataPort}
                            workQueue={this.props.workQueue}
                        />
                    </Panel>
                </div>
            </div>
        );
    }

    /**
     * Event handler called by the Digital Signal Sampler when it has retrieved a new set of samples
     * for the two channels.
     * @param sampleChannels - Array of two Int16Arrays that store the samples for each channel.
     */
    private async OnSampleChannelsUpdate(sampleChannels: Int16Array[]): Promise<void> {
        // Update the Signal View and Spectrum Analyzer with the new samples.
        this._DigitalSignalRef.current?.UpdateChartData(sampleChannels);

        await this._SpectrumAnalyzerRef.current?.UpdateChartData(sampleChannels);
    }

    private async OnIsSampleChannelEnabledChange(channelIndex: number, checked: boolean | 'indeterminate') {
        this.setState((prevState) => {
            const newChannelStates = [...prevState.channelEnableStates];
            newChannelStates[channelIndex] = checked === true; // Update the specific channel

            return { channelEnableStates: newChannelStates };
        }, 
        () => {
            this._DigitalSignalRef.current?.UpdateChannelEnableStates(this.state.channelEnableStates);
            this._SpectrumAnalyzerRef.current?.UpdateChannelEnableStates(this.state.channelEnableStates);

        });
    }
}

export default FrontPanel;
