/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { Component, ReactNode } from "react";

import "./SpectrumAnalyzerView.css";

import {
    Chart as ChartJS,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    ChartOptions
} from "chart.js";

import { Line } from "react-chartjs-2";

import { SpectrumAnalyzerDriver } from "./SpectrumAnalyzerDriver";

import { WorkQueue } from "@opalkelly/frontpanel-platform-api";

import { ADCProductConfig } from "./ADCProductConfig";

import { Vector2D } from "./Vector";

import SpectrogramView from "./SpectrogramView";

export type SpectrumDisplayMode = "spectrum" | "spectrogram";

/**
 * Properties for the Spectrum Analyzer View.
 *
 * `outputBuffers` is owned by App.tsx so the MCP `spectrum_read_latest`
 * tool can read the most recent FFT result from the same backing store
 * the chart renders. UpdateChartData fills these in place; readers must
 * serialize against captures via the shared WorkQueue.
 */
interface SpectrumAnalyzerViewProps {
    label: string;
    channelColors: string[];
    adcConfig: ADCProductConfig;
    driver: SpectrumAnalyzerDriver;
    workQueue: WorkQueue;
    mode: SpectrumDisplayMode;
    spectrogramNoiseFloor: number;
    spectrogramGamma: number;
    outputBuffers: Float64Array[];
    channelEnableStates: boolean[];
}

/**
 * Spectrum Analyzer View component for displaying the spectrum of a signal.
 */
class SpectrumAnalyzerView extends Component<SpectrumAnalyzerViewProps> {
    private _ChartRef: React.RefObject<ChartJS<"line">>;
    private _SpectrogramRef: React.RefObject<SpectrogramView>;
    private _ChartOptions: ChartOptions<"line">;
    private _ChartData;

    private _FrequencyScale = 0.000001;     // MHz frequency scale

    protected get WorkQueue(): WorkQueue {
        return this.props.workQueue;
    }

    constructor(props: SpectrumAnalyzerViewProps) {
        super(props);

        ChartJS.register(LinearScale, PointElement, LineElement, Title);

        this._ChartRef = React.createRef();
        this._SpectrogramRef = React.createRef();

        this._ChartOptions = {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "linear",
                    min: 0.0,
                    max: props.driver.FFTConfiguration.GetBinFrequency(512) * this._FrequencyScale,
                    ticks: { display: true, stepSize: 5 },
                    title: { display: true, text: "Frequency (MHz)" },
                    grid: {
                        color: "rgba(255, 255, 255, 0.1)"
                    }
                },
                y: {
                    type: "linear",
                    min: -130.0,
                    max: 0.0,
                    ticks: { display: true, stepSize: 10.0 },
                    grid: {
                        color: "rgba(255, 255, 255, 0.1)"
                    }
                }
            },
            plugins: {
                title: {
                    display: false,
                    text: "Output Signal"
                }
            }
        };

        // Create Chart Data that will be displayed by the ChartJS Chart
        const channels: Vector2D[][] = Array(2);

        channels[0] = new Array<Vector2D>(this.props.driver.SampleCount)
            .fill({ x: 0.0, y: 0.0 })
            .map(() => ({ x: 0.0, y: 0.0 }));
        channels[1] = new Array<Vector2D>(this.props.driver.SampleCount)
            .fill({ x: 0.0, y: 0.0 })
            .map(() => ({ x: 0.0, y: 0.0 }));

        const channel1BorderColor = SpectrumAnalyzerView.HexToRgba(props.channelColors[0], 1.0);
        const channel1BackgroundColor = SpectrumAnalyzerView.HexToRgba(props.channelColors[0], 0.5);

        const channel2BorderColor = SpectrumAnalyzerView.HexToRgba(props.channelColors[1], 1.0);
        const channel2BackgroundColor = SpectrumAnalyzerView.HexToRgba(props.channelColors[1], 0.5);

        this._ChartData = {
            datasets: [
                {
                    label: "Channel 1",
                    data: channels[0],
                    pointRadius: 0,
                    borderWidth: 1,
                    borderColor: channel1BorderColor,
                    backgroundColor: channel1BackgroundColor,
                    hidden: !props.channelEnableStates[0]
                },
                {
                    label: "Channel 2",
                    data: channels[1],
                    pointRadius: 0,
                    borderWidth: 1,
                    borderColor: channel2BorderColor,
                    backgroundColor: channel2BackgroundColor,
                    hidden: !props.channelEnableStates[1]
                }
            ]
        };
    }

    componentDidUpdate(prevProps: SpectrumAnalyzerViewProps): void {
        if (prevProps.channelEnableStates !== this.props.channelEnableStates) {
            this._ChartData.datasets[0].hidden = !this.props.channelEnableStates[0];
            this._ChartData.datasets[1].hidden = !this.props.channelEnableStates[1];
            this._ChartRef.current?.update();
        }
    }

    render(): ReactNode {
        const isSpectrogram = this.props.mode === "spectrogram";
        return (
            <div className="okSpectrumAnalyzerChartContainer">
                {isSpectrogram ? (
                    <SpectrogramView
                        ref={this._SpectrogramRef}
                        label="Spectrogram"
                        adcConfig={this.props.adcConfig}
                        binCount={this.props.driver.FFTConfiguration.FFTLength >> 1}
                        dbFloor={this.props.spectrogramNoiseFloor}
                        gamma={this.props.spectrogramGamma}
                    />
                ) : (
                    <Line ref={this._ChartRef} options={this._ChartOptions} data={this._ChartData} />
                )}
            </div>
        );
    }

    /**
     * Computes the FFT of the supplied time-domain samples, writes the
     * magnitudes into `props.outputBuffers`, and refreshes the chart.
     * App.tsx owns `outputBuffers` so the MCP `spectrum_read_latest`
     * tool can read the same backing store.
     */
    public async UpdateChartData(sampleChannels: Int16Array[]): Promise<void> {
        const buffers = this.props.outputBuffers;
        await this.WorkQueue.post(async () => {
            await this.props.driver.ComputeSpectrum(sampleChannels[0], buffers[0]);
            await this.props.driver.ComputeSpectrum(sampleChannels[1], buffers[1]);
        });

        for (let sampleIndex = 0; sampleIndex < buffers[0].length; sampleIndex++) {
            this._ChartData.datasets[0].data[sampleIndex].x =
                this.props.driver.FFTConfiguration.GetBinFrequency(sampleIndex) * this._FrequencyScale;
            this._ChartData.datasets[0].data[sampleIndex].y =
                20.0 * Math.log10(buffers[0][sampleIndex] / this.props.adcConfig.fftOutputPeak);
        }

        for (let sampleIndex = 0; sampleIndex < buffers[1].length; sampleIndex++) {
            this._ChartData.datasets[1].data[sampleIndex].x =
                this.props.driver.FFTConfiguration.GetBinFrequency(sampleIndex) * this._FrequencyScale;
            this._ChartData.datasets[1].data[sampleIndex].y =
                20.0 * Math.log10(buffers[1][sampleIndex] / this.props.adcConfig.fftOutputPeak);
        }

        if (this.props.mode === "spectrogram") {
            this._SpectrogramRef.current?.AddFrame(buffers[0], buffers[1]);
        } else if (this._ChartRef.current != null) {
            this._ChartRef.current.update("none");
        }
    }

    private static HexToRgba(hex: string, alpha: number): string {
        // Remove leading '#' if present
        hex = hex.replace(/^#/, "");
        // Expand short form (#abc) to full form (#aabbcc)
        if (hex.length === 3) {
            hex = hex.split("").map(x => x + x).join("");
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
}

export default SpectrumAnalyzerView;
