/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { Component, ReactNode } from "react";

import "./SpectrumView.css";

import {
    Chart as ChartJS,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    ChartOptions
} from "chart.js";

import { Line } from "react-chartjs-2";

import { CaptureSequencer } from "./CaptureSequencer";

import { WorkQueue } from "@opalkelly/frontpanel-platform-api";

import FFTConfiguration from "./FFTConfiguration";

import { Vector2D } from "./Vector";

import SpectrogramView from "./SpectrogramView";

export type SpectrumDisplayMode = "spectrum" | "spectrogram";

interface SpectrumViewProps {
    label: string;
    channelColors: string[];
    /** FFT magnitude of a full-scale sine. The dBFS reference for the display. */
    fftOutputPeak: number;
    sequencer: CaptureSequencer;
    fftConfiguration: FFTConfiguration;
    binCount: number;
    workQueue: WorkQueue;
    mode: SpectrumDisplayMode;
    spectrogramNoiseFloor: number;
    spectrogramGamma: number;
    /** Fixed canvas repaint period (ms) for the spectrogram waterfall. */
    spectrogramRenderPeriodMs?: number;
}

class SpectrumView extends Component<SpectrumViewProps> {
    private _Spectrum: { mag1: Float64Array; mag2: Float64Array } | undefined;

    private _ChartRef: React.RefObject<ChartJS<"line">>;
    private _SpectrogramRef: React.RefObject<SpectrogramView>;
    private _ChartOptions: ChartOptions<"line">;
    private _ChartData;

    private _FrequencyScale = 0.000001;     // MHz frequency scale

    // Captures hardware FFT frames back-to-back, so the waterfall scrolls at the
    // capture rate rather than the oscilloscope's frame rate.
    private _SpectrogramLoopActive = false;

    protected get WorkQueue(): WorkQueue {
        return this.props.workQueue;
    }

    constructor(props: SpectrumViewProps) {
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
                    max: props.fftConfiguration.GetBinFrequency(props.binCount) * this._FrequencyScale,
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

        const channels: Vector2D[][] = Array(2);

        // binCount, not FFT length: only the positive-frequency half is filled by
        // the hardware FFT.
        channels[0] = new Array<Vector2D>(this.props.binCount)
            .fill({ x: 0.0, y: 0.0 })
            .map(() => ({ x: 0.0, y: 0.0 }));
        channels[1] = new Array<Vector2D>(this.props.binCount)
            .fill({ x: 0.0, y: 0.0 })
            .map(() => ({ x: 0.0, y: 0.0 }));

        const channel1BorderColor = SpectrumView.HexToRgba(props.channelColors[0], 1.0);
        const channel1BackgroundColor = SpectrumView.HexToRgba(props.channelColors[0], 0.5);

        const channel2BorderColor = SpectrumView.HexToRgba(props.channelColors[1], 1.0);
        const channel2BackgroundColor = SpectrumView.HexToRgba(props.channelColors[1], 0.5);

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

    componentDidMount(): void {
        if (this.props.mode === "spectrogram") {
            this.StartSpectrogramLoop();
        }
    }

    componentDidUpdate(prevProps: SpectrumViewProps): void {
        if (prevProps.mode !== this.props.mode) {
            if (this.props.mode === "spectrogram") {
                this.StartSpectrogramLoop();
            } else {
                this.StopSpectrogramLoop();
            }
        }
    }

    componentWillUnmount(): void {
        this.StopSpectrogramLoop();
    }

    private StartSpectrogramLoop(): void {
        if (this._SpectrogramLoopActive) return;
        this._SpectrogramLoopActive = true;
        void this.SpectrogramLoop();
    }

    private StopSpectrogramLoop(): void {
        this._SpectrogramLoopActive = false;
    }

    /**
     * Capture one hardware FFT frame (both channels), append it as a spectrogram
     * row, then immediately schedule the next. The capture itself paces the loop.
     */
    private async SpectrogramLoop(): Promise<void> {
        if (!this._SpectrogramLoopActive) return;

        try {
            await this.CaptureSpectrum();
            if (this._Spectrum !== undefined) {
                this._SpectrogramRef.current?.AddFrame(this._Spectrum.mag1, this._Spectrum.mag2);
            }
        } catch (error) {
            console.error(`Spectrogram capture failed: \n${error}`);
        }

        if (this._SpectrogramLoopActive) {
            // Yield to the browser to composite the canvas between rows.
            setTimeout(() => { void this.SpectrogramLoop(); }, 0);
        }
    }

    render(): ReactNode {
        const isSpectrogram = this.props.mode === "spectrogram";
        return (
            <div className="okSpectrumChartContainer">
                {isSpectrogram ? (
                    <SpectrogramView
                        ref={this._SpectrogramRef}
                        label="Spectrogram"
                        fftOutputPeak={this.props.fftOutputPeak}
                        binCount={this.props.binCount}
                        dbFloor={this.props.spectrogramNoiseFloor}
                        gamma={this.props.spectrogramGamma}
                        renderPeriodMs={this.props.spectrogramRenderPeriodMs}
                    />
                ) : (
                    <Line ref={this._ChartRef} options={this._ChartOptions} data={this._ChartData} />
                )}
            </div>
        );
    }

    /**
     * Captures a spectrum frame from the hardware FFT and updates the chart.
     * The analyzer captures its own frame, so what is plotted here is a
     * different acquisition from the one the time-domain view is showing.
     * @returns A promise that resolves when the chart data has been updated.
     */
    public async UpdateChartData(): Promise<void> {
        // The spectrogram loop is already arming captures in this mode.
        if (this.props.mode === "spectrogram") {
            return;
        }

        await this.CaptureSpectrum();

        if (this._Spectrum === undefined) {
            return;
        }

        const magnitudes = [this._Spectrum.mag1, this._Spectrum.mag2];
        for (let channel = 0; channel < magnitudes.length; channel++) {
            const data = this._ChartData.datasets[channel].data;
            for (let sampleIndex = 0; sampleIndex < magnitudes[channel].length; sampleIndex++) {
                data[sampleIndex].x =
                    this.props.fftConfiguration.GetBinFrequency(sampleIndex) * this._FrequencyScale;
                data[sampleIndex].y =
                    20.0 *
                    Math.log10(magnitudes[channel][sampleIndex] / this.props.fftOutputPeak);
            }
        }

        if (this._ChartRef.current != null) {
            this._ChartRef.current.update("none");
        }
    }

    /**
     * Capture one hardware FFT frame: both channels, in one call and one arm.
     * WorkQueue.post resolves void, so the result is captured into a field.
     */
    private async CaptureSpectrum(): Promise<void> {
        await this.WorkQueue.post(async () => {
            this._Spectrum = await this.props.sequencer.ReadSpectrum();
        });
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

export default SpectrumView;
