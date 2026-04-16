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

import { SpectrumAnalyzer } from "./SpectrumAnalyzer";

import { IFPGADataPortClassic, WorkQueue, ByteCount } from "@opalkelly/frontpanel-platform-api";

import FFTConfiguration, { Hertz } from "./FFTConfiguration";

import { Vector2D } from "./Vector";

/**
 * Properties for the Spectrum Analyzer View.
 */
interface SpectrumAnalyzerViewProps {
    label: string;
    channelColors: string[];
    fpgaDataPort: IFPGADataPortClassic;
    workQueue: WorkQueue;
}

/**
 * Spectrum Analyzer View component for displaying the spectrum of a signal.
 */
class SpectrumAnalyzerView extends Component<SpectrumAnalyzerViewProps> {
    private readonly _FFTConfiguration: FFTConfiguration;
    private readonly _SpectrumAnalyzer: SpectrumAnalyzer;

    private readonly _SampleChannels: Float64Array[];

    private _ChartRef: React.RefObject<ChartJS<"line">>;
    private _ChartOptions: ChartOptions<"line">;
    private _ChartData;

    private _FrequencyScale = 0.000001;

    protected get WorkQueue(): WorkQueue {
        return this.props.workQueue;
    }

    constructor(props: SpectrumAnalyzerViewProps) {
        super(props);

        // Create FFT Configuration
        const fftLength = 1024; // 1024 bin FFT Length
        const sampleRate: Hertz = 125000000; // 125MHz Sample Rate
        const maxAmplitudeValue = 0x1fffff;

        this._FFTConfiguration = new FFTConfiguration(fftLength, sampleRate, maxAmplitudeValue);

        // Create Spectrum Analyzer
        const sampleSize: ByteCount = 8;
        const sampleCount: number = this._FFTConfiguration.FFTLength;

        this._SpectrumAnalyzer = new SpectrumAnalyzer(props.fpgaDataPort, sampleSize, sampleCount);

        // Creates an array of two Float64Array objects one for each of the two channels available.
        this._SampleChannels = new Array(2);

        this._SampleChannels[0] = new Float64Array(this._SpectrumAnalyzer.SampleCount);
        this._SampleChannels[1] = new Float64Array(this._SpectrumAnalyzer.SampleCount);

        // Create ChartJS Chart Reference to display the output of the Spectrum Analyzer
        ChartJS.register(LinearScale, PointElement, LineElement, Title);

        this._ChartRef = React.createRef();

        this._ChartOptions = {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "linear",
                    min: 0.0,
                    max: this._FFTConfiguration.GetBinFrequency(512) * this._FrequencyScale,
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

        channels[0] = new Array<Vector2D>(this._SpectrumAnalyzer.SampleCount)
            .fill({ x: 0.0, y: 0.0 })
            .map(() => ({ x: 0.0, y: 0.0 }));
        channels[1] = new Array<Vector2D>(this._SpectrumAnalyzer.SampleCount)
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
                    hidden: false
                },
                {
                    label: "Channel 2",
                    data: channels[1],
                    pointRadius: 0,
                    borderWidth: 1,
                    borderColor: channel2BorderColor,
                    backgroundColor: channel2BackgroundColor,
                    hidden: false
                }
            ]
        };
    }

    render(): ReactNode {
        return (
            <div className="okSpectrumAnalyzerChartContainer">
                <Line ref={this._ChartRef} options={this._ChartOptions} data={this._ChartData} />
            </div>
        );
    }

    /**
     * Updates the chart data to display the frequency spectrum computed from the time domain
     * signal samples.
     * @param sampleChannels - Array of two Int16Arrays that store the samples for each channel.
     * @returns A promise that resolves when the chart data has been updated.
     */
    public async UpdateChartData(sampleChannels: Int16Array[]): Promise<void> {
        await this.WorkQueue.post(async () => {
            await this._SpectrumAnalyzer.ComputeSpectrum(
                sampleChannels[0],
                this._SampleChannels[0]
            );
            await this._SpectrumAnalyzer.ComputeSpectrum(
                sampleChannels[1],
                this._SampleChannels[1]
            );
        });

        const maximumAmplitudeValue: number = this._FFTConfiguration.MaximumAmplitudeValue;

        for (let sampleIndex = 0; sampleIndex < this._SampleChannels[0].length; sampleIndex++) {
            this._ChartData.datasets[0].data[sampleIndex].x =
                this._FFTConfiguration.GetBinFrequency(sampleIndex) * this._FrequencyScale;
            this._ChartData.datasets[0].data[sampleIndex].y =
                20.0 * Math.log10(this._SampleChannels[0][sampleIndex] / maximumAmplitudeValue);
        }

        for (let sampleIndex = 0; sampleIndex < this._SampleChannels[1].length; sampleIndex++) {
            this._ChartData.datasets[1].data[sampleIndex].x =
                this._FFTConfiguration.GetBinFrequency(sampleIndex) * this._FrequencyScale;
            this._ChartData.datasets[1].data[sampleIndex].y =
                20.0 * Math.log10(this._SampleChannels[1][sampleIndex] / maximumAmplitudeValue);
        }

        if (this._ChartRef.current != null) {
            this._ChartRef.current.update("none");
        }
    }

    public async UpdateChannelEnableStates(channelEnableStates: boolean[]) {
        const spectrumChart = this._ChartRef.current;

        if (spectrumChart) {
            spectrumChart.data.datasets[0].hidden = !channelEnableStates[0];
            spectrumChart.data.datasets[1].hidden = !channelEnableStates[1];

            spectrumChart.update();
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
