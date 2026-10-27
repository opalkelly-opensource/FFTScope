/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
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
import SpectrumView, { SpectrumDisplayMode } from "./SpectrumView";

import NumberDragSlider from "./NumberDragSlider";

import Panel from "./Panel";

import { CaptureSequencer } from "./CaptureSequencer";

import FFTConfiguration from "./FFTConfiguration";

import { FrequencyVector, FrequencyVectorState } from "./WaveformGenerator";

const VIEW_UPDATE_PERIOD_MS = 35;

export const SPECTROGRAM_NOISE_FLOOR_MIN = -130;
export const SPECTROGRAM_NOISE_FLOOR_MAX = -10;
export const SPECTROGRAM_NOISE_FLOOR_DEFAULT = -130;

// Gamma is tracked as integer "stops" so the drag slider moves it geometrically:
// gamma = 2^(stops / GAMMA_STOPS_PER_OCTAVE), -16..+16 stops → 0.25..4.0.
export const SPECTROGRAM_GAMMA_STOPS_MIN = -16;
export const SPECTROGRAM_GAMMA_STOPS_MAX = 16;
export const SPECTROGRAM_GAMMA_STOPS_DEFAULT = 0;
const GAMMA_STOPS_PER_OCTAVE = 8;

export const gammaFromStops = (stops: number): number => Math.pow(2, stops / GAMMA_STOPS_PER_OCTAVE);
export const stopsFromGamma = (gamma: number): number => Math.round(GAMMA_STOPS_PER_OCTAVE * Math.log2(gamma));

export interface FFTScopeViewProps {
    name: string;
    // Board constants: adcBitWidth sets the time chart's Y bounds, fftOutputPeak
    // is the dBFS reference for the spectrum and spectrogram.
    adcBitWidth: number;
    fftOutputPeak: number;

    captureSequencer: CaptureSequencer;
    adcPresent: boolean;
    dacPresent: boolean;
    spectrumConfiguration: FFTConfiguration;
    waveformConfiguration: FFTConfiguration;
    workQueue: WorkQueue;

    wavegenVectors: FrequencyVectorState[];
    isAutoScaleEnabled: boolean;
    amplitudeScaleFactor: number;
    onWavegenVectorChange: (slot: number, vector: FrequencyVector, enabled: boolean) => Promise<number>;
    onWavegenAutoScaleChange: (enabled: boolean) => Promise<number>;
    onWavegenReset: () => Promise<void>;

    channelEnableStates: boolean[];
    spectrumMode: SpectrumDisplayMode;
    spectrogramNoiseFloor: number;
    spectrogramGammaStops: number;
    isContinuous: boolean;
    onChannelEnabledChange: (channelIndex: number, enabled: boolean) => void;
    onSpectrumModeChange: (mode: SpectrumDisplayMode) => void;
    onSpectrogramNoiseFloorChange: (floorDbfs: number) => void;
    onSpectrogramGammaStopsChange: (stops: number) => void;
    onContinuousChange: (enabled: boolean) => void;
    onDigitizerReset: () => Promise<boolean>;
}

interface FFTScopeViewState {
    channelColors: string[];
}

class FFTScopeView extends Component<FFTScopeViewProps, FFTScopeViewState> {
    private readonly _TimeDomainRef: React.RefObject<TimeDomainView>;
    private readonly _SpectrumRef: React.RefObject<SpectrumView>;

    constructor(props: FFTScopeViewProps) {
        super(props);

        this._TimeDomainRef = React.createRef();
        this._SpectrumRef = React.createRef();

        this.state = {
            channelColors: [
                "#EF2424",
                "#2E7CE9",
            ]
        };
    }

    componentDidUpdate(prevProps: FFTScopeViewProps): void {
        // These toggles gate only the time-domain waveform; the spectrum and
        // spectrogram always show both channels.
        if (prevProps.channelEnableStates !== this.props.channelEnableStates) {
            this._TimeDomainRef.current?.UpdateChannelEnableStates(this.props.channelEnableStates);
        }
    }

    private OnSpectrumModeChange = (pressed: boolean): void => {
        this.props.onSpectrumModeChange(pressed ? "spectrogram" : "spectrum");
    };

    render() {
        return (
            <div className="okFrontPanel">
                <Panel
                    title={"Waveform\nGenerator"}
                    className="okWaveformGeneratorPanel"
                    disabled={!this.props.dacPresent}>
                        {(this.props.dacPresent) ?
                            <WaveformGeneratorView
                                label="OutputView"
                                fftConfiguration={this.props.waveformConfiguration}
                                vectors={this.props.wavegenVectors}
                                isAutoScaleEnabled={this.props.isAutoScaleEnabled}
                                amplitudeScaleFactor={this.props.amplitudeScaleFactor}
                                onVectorChange={this.props.onWavegenVectorChange}
                                onAutoScaleChange={this.props.onWavegenAutoScaleChange}
                                onReset={this.props.onWavegenReset}
                            /> :
                            <div className="okPanelPlaceholder">Requires DAC on Port A</div>}

                </Panel>
                <div className="okColumnLayoutContainer">
                    <Panel
                        title="Data Acquisition"
                        disabled={!this.props.adcPresent}>
                            {(this.props.adcPresent) ?
                                <DigitizerView
                                    label="OutputView"
                                    sequencer={this.props.captureSequencer}
                                    workQueue={this.props.workQueue}
                                    updatePeriodMilliseconds={VIEW_UPDATE_PERIOD_MS}
                                    onSampleChannelsUpdate={this.OnSampleChannelsUpdate.bind(this)}
                                    channelEnableStates={this.props.channelEnableStates}
                                    channelEnableStateChange={this.OnIsSampleChannelEnabledChange.bind(this)}
                                    isContinuous={this.props.isContinuous}
                                    onContinuousChange={this.props.onContinuousChange}
                                    onReset={this.props.onDigitizerReset}
                                    channelColors={this.state.channelColors}
                                /> :
                                <div className="okPanelPlaceholder">Requires ADC on Port B</div>}
                    </Panel>
                    <Panel
                        title="Time Domain"
                        className="okChartControlPanel"
                        disabled={!this.props.adcPresent}>
                            {(this.props.adcPresent) ?
                                <TimeDomainView
                                    ref={this._TimeDomainRef}
                                    label="OutputView"
                                    adcBitWidth={this.props.adcBitWidth}
                                    sampleCount={this.props.captureSequencer.SampleCount}
                                    channelColors={this.state.channelColors}
                                /> :
                                <div className="okPanelPlaceholder">Requires ADC on Port B</div>}
                    </Panel>
                    <Panel
                        title="Spectrum - (2,048-pt FFT)"
                        className="okChartControlPanel"
                        disabled={!this.props.adcPresent}
                        headerRight={this.props.adcPresent ? (
                            <div className="okSpectrumHeaderControls">
                                <div
                                    className={`okSpectrumColorDial${this.props.spectrumMode === "spectrogram" ? "" : " disabled"}`}>
                                    <span className="okSpectrumModeLabel">Floor</span>
                                    <NumberDragSlider
                                        label="dBFS"
                                        minimum={SPECTROGRAM_NOISE_FLOOR_MIN}
                                        maximum={SPECTROGRAM_NOISE_FLOOR_MAX}
                                        stepsPerPixel={{ coarse: 0.25, fine: 0.065 }}
                                        value={this.props.spectrogramNoiseFloor}
                                        onValueChange={this.props.onSpectrogramNoiseFloorChange}>
                                        <span className="okSpectrumColorDialValue">
                                            {this.props.spectrogramNoiseFloor}
                                        </span>
                                        <span className="okSpectrumColorDialUnits">dBFS</span>
                                    </NumberDragSlider>
                                </div>
                                <div
                                    className={`okSpectrumColorDial${this.props.spectrumMode === "spectrogram" ? "" : " disabled"}`}>
                                    <span className="okSpectrumModeLabel">Contrast</span>
                                    <NumberDragSlider
                                        label="γ"
                                        minimum={SPECTROGRAM_GAMMA_STOPS_MIN}
                                        maximum={SPECTROGRAM_GAMMA_STOPS_MAX}
                                        stepsPerPixel={{ coarse: 0.125, fine: 0.03125 }}
                                        value={this.props.spectrogramGammaStops}
                                        onValueChange={this.props.onSpectrogramGammaStopsChange}>
                                        <span className="okSpectrumColorDialValue">
                                            {gammaFromStops(this.props.spectrogramGammaStops).toFixed(2)}
                                        </span>
                                        <span className="okSpectrumColorDialUnits">γ</span>
                                    </NumberDragSlider>
                                </div>
                                <div className="okSpectrumModeSwitch">
                                    <span className="okSpectrumModeLabel">Spectrogram</span>
                                    <Switch.Root
                                        className="okSwitchRoot"
                                        checked={this.props.spectrumMode === "spectrogram"}
                                        onCheckedChange={this.OnSpectrumModeChange}
                                    >
                                        <Switch.Thumb className="okSwitchThumb" />
                                    </Switch.Root>
                                </div>
                            </div>
                        ) : undefined}>
                            {(this.props.adcPresent) ?
                                <SpectrumView
                                    ref={this._SpectrumRef}
                                    label="OutputSpectrumView"
                                    channelColors={this.state.channelColors}
                                    fftOutputPeak={this.props.fftOutputPeak}
                                    sequencer={this.props.captureSequencer}
                                    fftConfiguration={this.props.spectrumConfiguration}
                                    binCount={this.props.captureSequencer.BinCount}
                                    workQueue={this.props.workQueue}
                                    mode={this.props.spectrumMode}
                                    spectrogramNoiseFloor={this.props.spectrogramNoiseFloor}
                                    spectrogramGamma={gammaFromStops(this.props.spectrogramGammaStops)}
                                    spectrogramRenderPeriodMs={VIEW_UPDATE_PERIOD_MS}
                                /> :
                                <div className="okPanelPlaceholder">Requires ADC on Port B</div>}
                    </Panel>
                </div>
            </div>
        );
    }

    /**
     * Event handler called when a new set of samples for the two channels has been
     * retrieved. The spectrum analyzer captures its own frame from the hardware FFT
     * so pacing it off this tick only sets its rate.
     * @param sampleChannels - Array of two Int16Arrays that store the samples for each channel.
     */
    public async OnSampleChannelsUpdate(sampleChannels: Int16Array[]): Promise<void> {
        this._TimeDomainRef.current?.UpdateChartData(sampleChannels);

        await this._SpectrumRef.current?.UpdateChartData();
    }

    private OnIsSampleChannelEnabledChange(channelIndex: number, checked: boolean | 'indeterminate'): void {
        this.props.onChannelEnabledChange(channelIndex, checked === true);
    }
}

export default FFTScopeView;
