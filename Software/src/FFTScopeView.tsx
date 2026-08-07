/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { ReactNode } from "react";

import * as Switch from "@radix-ui/react-switch";

import { WorkQueue } from "@opalkelly/frontpanel-platform-api";

import "./FFTScopeView.css";

import WaveformGeneratorView, { FrequencyVectorState } from "./WaveformGeneratorView";
import DigitizerView from "./DigitizerView";

import TimeDomainView from "./TimeDomainView";
import SpectrumAnalyzerView, { SpectrumDisplayMode } from "./SpectrumAnalyzerView";

import NumberDragSlider from "./NumberDragSlider";

import Panel from "./Panel";

import { WaveformGeneratorDriver } from "./WaveformGeneratorDriver";
import { DigitizerDriver } from "./DigitizerDriver";
import { SpectrumAnalyzerDriver } from "./SpectrumAnalyzerDriver";

import { ADCProductConfig } from "./ADCProductConfig";

import { FrequencyVector } from "./WaveformGeneratorAdapter";

import {
    SPECTROGRAM_NOISE_FLOOR_MIN,
    SPECTROGRAM_NOISE_FLOOR_MAX,
    SPECTROGRAM_GAMMA_STOPS_MIN,
    SPECTROGRAM_GAMMA_STOPS_MAX,
    gammaFromStops
} from "./spectrum-units";

export interface FFTScopeViewProps {
    name: string;
    adcConfig: ADCProductConfig;
    waveformGeneratorDriver?: WaveformGeneratorDriver;
    digitizerDriver?: DigitizerDriver;
    spectrumAnalyzerDriver?: SpectrumAnalyzerDriver;
    workQueue: WorkQueue;
    spectrumViewRef: React.RefObject<SpectrumAnalyzerView>;
    timeDomainViewRef: React.RefObject<TimeDomainView>;

    // Waveform Generator
    frequencyVectors: FrequencyVectorState[];
    autoscaleEnabled: boolean;
    amplitudeScaleFactor: number;
    onWaveformInitialize: () => void;
    onWaveformReset: () => void;
    onAutoscaleChange: (enabled: boolean) => void;
    onVectorChange: (vectorId: number, vector: FrequencyVector) => void;
    onVectorEnabledChange: (vectorId: number, enabled: boolean) => void;

    // Digitizer
    channelEnableStates: boolean[];
    channelColors: string[];
    onChannelEnableStateChange: (channelIndex: number, enabled: boolean) => void;
    continuousEnabled: boolean;
    onContinuousChange: (enabled: boolean) => void;
    onCaptureOnce: () => void;
    onDigitizerReset: () => void;

    // Spectrum
    spectrumMode: SpectrumDisplayMode;
    onSpectrumModeChange: (mode: SpectrumDisplayMode) => void;
    spectrogramNoiseFloor: number;
    onSpectrogramNoiseFloorChange: (value: number) => void;
    spectrogramGammaStops: number;
    onSpectrogramGammaStopsChange: (value: number) => void;
    spectrumOutputBuffers: Float64Array[];
}

function FFTScopeView(props: FFTScopeViewProps): ReactNode {
    return (
        <div className="okFrontPanel">
            <Panel
                title={"Waveform\nGenerator"}
                className="okWaveformGeneratorPanel"
                disabled={!props.waveformGeneratorDriver}>
                    {(props.waveformGeneratorDriver) ?
                        <WaveformGeneratorView
                            label="OutputView"
                            driver={props.waveformGeneratorDriver}
                            frequencyVectors={props.frequencyVectors}
                            autoscaleEnabled={props.autoscaleEnabled}
                            amplitudeScaleFactor={props.amplitudeScaleFactor}
                            onInitialize={props.onWaveformInitialize}
                            onReset={props.onWaveformReset}
                            onAutoscaleChange={props.onAutoscaleChange}
                            onVectorChange={props.onVectorChange}
                            onVectorEnabledChange={props.onVectorEnabledChange}
                        /> :
                        <div className="okPanelPlaceholder">Requires DAC on Port A</div>}
            </Panel>
            <div className="okColumnLayoutContainer">
                <Panel
                    title="Data Acquisition"
                    disabled={!props.digitizerDriver}>
                        {(props.digitizerDriver) ?
                            <DigitizerView
                                label="OutputView"
                                driver={props.digitizerDriver}
                                channelEnableStates={props.channelEnableStates}
                                channelColors={props.channelColors}
                                onChannelEnableStateChange={props.onChannelEnableStateChange}
                                continuousEnabled={props.continuousEnabled}
                                onContinuousChange={props.onContinuousChange}
                                onCaptureOnce={props.onCaptureOnce}
                                onReset={props.onDigitizerReset}
                            /> :
                            <div className="okPanelPlaceholder">Requires ADC on Port B</div>}
                </Panel>
                <Panel
                    title="Time Domain"
                    className="okChartControlPanel"
                    disabled={!props.digitizerDriver}>
                        {(props.digitizerDriver) ?
                            <TimeDomainView
                                ref={props.timeDomainViewRef}
                                label="OutputView"
                                adcBitWidth={props.adcConfig.adcBitWidth}
                                sampleCount={1024}
                                channelColors={props.channelColors}
                            /> :
                            <div className="okPanelPlaceholder">Requires ADC on Port B</div>}
                </Panel>
                <Panel
                    title="Spectrum - (1,024-pt FFT)"
                    className="okChartControlPanel"
                    disabled={!props.spectrumAnalyzerDriver}
                    headerRight={props.spectrumAnalyzerDriver ? (
                        <div className="okSpectrumHeaderControls">
                            <div
                                className={`okSpectrumColorDial${props.spectrumMode === "spectrogram" ? "" : " disabled"}`}>
                                <span className="okSpectrumModeLabel">Floor</span>
                                <NumberDragSlider
                                    label="dBFS"
                                    minimum={SPECTROGRAM_NOISE_FLOOR_MIN}
                                    maximum={SPECTROGRAM_NOISE_FLOOR_MAX}
                                    stepsPerPixel={{ coarse: 0.25, fine: 0.065 }}
                                    value={props.spectrogramNoiseFloor}
                                    onValueChange={props.onSpectrogramNoiseFloorChange}>
                                    <span className="okSpectrumColorDialValue">
                                        {props.spectrogramNoiseFloor}
                                    </span>
                                    <span className="okSpectrumColorDialUnits">dBFS</span>
                                </NumberDragSlider>
                            </div>
                            <div
                                className={`okSpectrumColorDial${props.spectrumMode === "spectrogram" ? "" : " disabled"}`}>
                                <span className="okSpectrumModeLabel">Contrast</span>
                                <NumberDragSlider
                                    label="γ"
                                    minimum={SPECTROGRAM_GAMMA_STOPS_MIN}
                                    maximum={SPECTROGRAM_GAMMA_STOPS_MAX}
                                    stepsPerPixel={{ coarse: 0.125, fine: 0.03125 }}
                                    value={props.spectrogramGammaStops}
                                    onValueChange={props.onSpectrogramGammaStopsChange}>
                                    <span className="okSpectrumColorDialValue">
                                        {gammaFromStops(props.spectrogramGammaStops).toFixed(2)}
                                    </span>
                                    <span className="okSpectrumColorDialUnits">γ</span>
                                </NumberDragSlider>
                            </div>
                            <div className="okSpectrumModeSwitch">
                                <span className="okSpectrumModeLabel">Spectrogram</span>
                                <Switch.Root
                                    className="okSwitchRoot"
                                    checked={props.spectrumMode === "spectrogram"}
                                    onCheckedChange={(pressed) =>
                                        props.onSpectrumModeChange(pressed ? "spectrogram" : "spectrum")
                                    }
                                >
                                    <Switch.Thumb className="okSwitchThumb" />
                                </Switch.Root>
                            </div>
                        </div>
                    ) : undefined}>
                        {(props.spectrumAnalyzerDriver) ?
                            <SpectrumAnalyzerView
                                ref={props.spectrumViewRef}
                                label="OutputSpectrumView"
                                channelColors={props.channelColors}
                                adcConfig={props.adcConfig}
                                driver={props.spectrumAnalyzerDriver}
                                workQueue={props.workQueue}
                                mode={props.spectrumMode}
                                spectrogramNoiseFloor={props.spectrogramNoiseFloor}
                                spectrogramGamma={gammaFromStops(props.spectrogramGammaStops)}
                                outputBuffers={props.spectrumOutputBuffers}
                                channelEnableStates={props.channelEnableStates}
                            /> :
                            <div className="okPanelPlaceholder">Requires ADC on Port B</div>}
                </Panel>
            </div>
        </div>
    );
}

export default FFTScopeView;
