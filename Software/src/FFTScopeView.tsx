/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { Component } from "react";

import * as Switch from "@radix-ui/react-switch";

import { WorkQueue } from "@opalkelly/frontpanel-platform-api";

import "./FFTScopeView.css";

import WaveformGeneratorView from "./WaveformGeneratorView";
import DigitizerView from "./DigitizerView";

import TimeDomainView from "./TimeDomainView";
import SpectrumAnalyzerView, { SpectrumDisplayMode } from "./SpectrumAnalyzerView";

import NumberDragSlider from "./NumberDragSlider";

import Panel from "./Panel";

import { WaveformGeneratorDriver } from "./WaveformGeneratorDriver";
import { DigitizerDriver } from "./DigitizerDriver";
import { SpectrumAnalyzerDriver } from "./SpectrumAnalyzerDriver";

import { ADCProductConfig } from "./ADCProductConfig";

const SPECTROGRAM_NOISE_FLOOR_MIN = -130;
const SPECTROGRAM_NOISE_FLOOR_MAX = -10;
const SPECTROGRAM_NOISE_FLOOR_DEFAULT = -130;

// Gamma is internally tracked as an integer "stops" value so the drag slider
// moves it geometrically: gamma = 2^(stops / GAMMA_STOPS_PER_OCTAVE).
// Range -16..+16 stops → gamma 0.25..4.0, default 0 (gamma = 1.0 linear).
const SPECTROGRAM_GAMMA_STOPS_MIN = -16;
const SPECTROGRAM_GAMMA_STOPS_MAX = 16;
const SPECTROGRAM_GAMMA_STOPS_DEFAULT = 0;
const GAMMA_STOPS_PER_OCTAVE = 8;

const gammaFromStops = (stops: number): number => Math.pow(2, stops / GAMMA_STOPS_PER_OCTAVE);

export interface FFTScopeViewProps {
    name: string;
    adcConfig: ADCProductConfig;
    waveformGeneratorDriver?: WaveformGeneratorDriver;
    digitizerDriver?: DigitizerDriver;
    spectrumAnalyzerDriver?: SpectrumAnalyzerDriver;
    workQueue: WorkQueue;
}

interface FFTScopeViewState {
    channelEnableStates: boolean[];
    channelColors: string[];
    spectrumMode: SpectrumDisplayMode;
    spectrogramNoiseFloor: number;
    spectrogramGammaStops: number;
}

class FFTScopeView extends Component<FFTScopeViewProps, FFTScopeViewState> {
    private readonly _TimeDomainRef: React.RefObject<TimeDomainView>;
    private readonly _SpectrumAnalyzerRef: React.RefObject<SpectrumAnalyzerView>;

    constructor(props: FFTScopeViewProps) {
        super(props);

        this._TimeDomainRef = React.createRef();
        this._SpectrumAnalyzerRef = React.createRef();

        this.state = {
            channelEnableStates: [
                true,
                true
            ],
            channelColors: [
                "#EF2424",
                "#2E7CE9",
            ],
            spectrumMode: "spectrum",
            spectrogramNoiseFloor: SPECTROGRAM_NOISE_FLOOR_DEFAULT,
            spectrogramGammaStops: SPECTROGRAM_GAMMA_STOPS_DEFAULT
        };
    }

    private OnSpectrumModeChange = (pressed: boolean): void => {
        this.setState({ spectrumMode: pressed ? "spectrogram" : "spectrum" });
    };

    private OnSpectrogramNoiseFloorChange = (value: number): void => {
        this.setState({ spectrogramNoiseFloor: value });
    };

    private OnSpectrogramGammaStopsChange = (value: number): void => {
        this.setState({ spectrogramGammaStops: value });
    };

    render() {
        return (
            <div className="okFrontPanel">
                <Panel
                    title={"Waveform\nGenerator"}
                    className="okWaveformGeneratorPanel"
                    disabled={!this.props.waveformGeneratorDriver}>
                        {(this.props.waveformGeneratorDriver) ?
                            <WaveformGeneratorView
                                label="OutputView"
                                driver={this.props.waveformGeneratorDriver}
                                workQueue={this.props.workQueue}
                            /> :
                            <div className="okPanelPlaceholder">Requires DAC on Port A</div>}

                </Panel>
                <div className="okColumnLayoutContainer">
                    <Panel
                        title="Data Acquisition"
                        disabled={!this.props.digitizerDriver}>
                            {(this.props.digitizerDriver) ?
                                <DigitizerView
                                    label="OutputView"
                                    driver={this.props.digitizerDriver}
                                    workQueue={this.props.workQueue}
                                    updatePeriodMilliseconds={35}
                                    onSampleChannelsUpdate={this.OnSampleChannelsUpdate.bind(this)}
                                    channelEnableStates={this.state.channelEnableStates}
                                    channelEnableStateChange={this.OnIsSampleChannelEnabledChange.bind(this)}
                                    channelColors={this.state.channelColors}
                                /> :
                                <div className="okPanelPlaceholder">Requires ADC on Port B</div>}
                    </Panel>
                    <Panel
                        title="Time Domain"
                        className="okChartControlPanel"
                        disabled={!this.props.digitizerDriver}>
                            {(this.props.digitizerDriver) ?
                                <TimeDomainView
                                    ref={this._TimeDomainRef}
                                    label="OutputView"
                                    adcBitWidth={this.props.adcConfig.adcBitWidth}
                                    sampleCount={1024}
                                    channelColors={this.state.channelColors}
                                /> :
                                <div className="okPanelPlaceholder">Requires ADC on Port B</div>}
                    </Panel>
                    <Panel
                        title="Spectrum - (1,024-pt FFT)"
                        className="okChartControlPanel"
                        disabled={!this.props.spectrumAnalyzerDriver}
                        headerRight={this.props.spectrumAnalyzerDriver ? (
                            <div className="okSpectrumHeaderControls">
                                <div
                                    className={`okSpectrumColorDial${this.state.spectrumMode === "spectrogram" ? "" : " disabled"}`}>
                                    <span className="okSpectrumModeLabel">Floor</span>
                                    <NumberDragSlider
                                        label="dBFS"
                                        minimum={SPECTROGRAM_NOISE_FLOOR_MIN}
                                        maximum={SPECTROGRAM_NOISE_FLOOR_MAX}
                                        stepsPerPixel={{ coarse: 0.25, fine: 0.065 }}
                                        value={this.state.spectrogramNoiseFloor}
                                        onValueChange={this.OnSpectrogramNoiseFloorChange}>
                                        <span className="okSpectrumColorDialValue">
                                            {this.state.spectrogramNoiseFloor}
                                        </span>
                                        <span className="okSpectrumColorDialUnits">dBFS</span>
                                    </NumberDragSlider>
                                </div>
                                <div
                                    className={`okSpectrumColorDial${this.state.spectrumMode === "spectrogram" ? "" : " disabled"}`}>
                                    <span className="okSpectrumModeLabel">Contrast</span>
                                    <NumberDragSlider
                                        label="γ"
                                        minimum={SPECTROGRAM_GAMMA_STOPS_MIN}
                                        maximum={SPECTROGRAM_GAMMA_STOPS_MAX}
                                        stepsPerPixel={{ coarse: 0.125, fine: 0.03125 }}
                                        value={this.state.spectrogramGammaStops}
                                        onValueChange={this.OnSpectrogramGammaStopsChange}>
                                        <span className="okSpectrumColorDialValue">
                                            {gammaFromStops(this.state.spectrogramGammaStops).toFixed(2)}
                                        </span>
                                        <span className="okSpectrumColorDialUnits">γ</span>
                                    </NumberDragSlider>
                                </div>
                                <div className="okSpectrumModeSwitch">
                                    <span className="okSpectrumModeLabel">Spectrogram</span>
                                    <Switch.Root
                                        className="okSwitchRoot"
                                        checked={this.state.spectrumMode === "spectrogram"}
                                        onCheckedChange={this.OnSpectrumModeChange}
                                    >
                                        <Switch.Thumb className="okSwitchThumb" />
                                    </Switch.Root>
                                </div>
                            </div>
                        ) : undefined}>
                            {(this.props.spectrumAnalyzerDriver) ?
                                <SpectrumAnalyzerView
                                    ref={this._SpectrumAnalyzerRef}
                                    label="OutputSpectrumView"
                                    channelColors={this.state.channelColors}
                                    adcConfig={this.props.adcConfig}
                                    driver={this.props.spectrumAnalyzerDriver}
                                    workQueue={this.props.workQueue}
                                    mode={this.state.spectrumMode}
                                    spectrogramNoiseFloor={this.state.spectrogramNoiseFloor}
                                    spectrogramGamma={gammaFromStops(this.state.spectrogramGammaStops)}
                                /> :
                                <div className="okPanelPlaceholder">Requires ADC on Port B</div>}
                    </Panel>
                </div>
            </div>
        );
    }

    /**
     * Event handler called by the Digitizer when it has retrieved a new set of samples
     * for the two channels.
     * @param sampleChannels - Array of two Int16Arrays that store the samples for each channel.
     */
    private async OnSampleChannelsUpdate(sampleChannels: Int16Array[]): Promise<void> {
        // Update the Signal View and Spectrum Analyzer with the new samples.
        this._TimeDomainRef.current?.UpdateChartData(sampleChannels);

        await this._SpectrumAnalyzerRef.current?.UpdateChartData(sampleChannels);
    }

    private async OnIsSampleChannelEnabledChange(channelIndex: number, checked: boolean | 'indeterminate') {
        this.setState((prevState) => {
            const newChannelStates = [...prevState.channelEnableStates];
            newChannelStates[channelIndex] = checked === true; // Update the specific channel

            return { channelEnableStates: newChannelStates };
        }, 
        () => {
            this._TimeDomainRef.current?.UpdateChannelEnableStates(this.state.channelEnableStates);
            this._SpectrumAnalyzerRef.current?.UpdateChannelEnableStates(this.state.channelEnableStates);

        });
    }
}

export default FFTScopeView;
