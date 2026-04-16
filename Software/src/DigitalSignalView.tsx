/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { Component, ReactNode } from "react";

import "./DigitalSignalView.css";

import {
    Chart as ChartJS,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    ChartOptions
} from "chart.js";

import { Line } from "react-chartjs-2";

import { Vector2D } from "./Vector";

/**
 * Digital Signal View Properties
 */
interface DigitalSignalViewProps {
    label: string;
    sampleCount: number;
    channelColors: string[];
}

/**
 * Digital Signal Sampler view component used to display the output of a Digital Signal Sampler.
 */
class DigitalSignalView extends Component<DigitalSignalViewProps> {
    private _ChartRef: React.RefObject<ChartJS<"line">>;
    private _ChartOptions: ChartOptions<"line">;
    private _ChartData;

    constructor(props: DigitalSignalViewProps) {
        super(props);

        // Create ChartJS Chart Reference to display the output of the Digital Signal Sampler
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
                    max: 1024.0,
                    grid: {
                        color: "rgba(255, 255, 255, 0.1)"
                    }
                },
                y: {
                    type: "linear",
                    min: -8192,
                    max: 8192,
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

        channels[0] = new Array<Vector2D>(props.sampleCount)
            .fill({ x: 0.0, y: 0.0 })
            .map(() => ({ x: 0.0, y: 0.0 }));
        channels[1] = new Array<Vector2D>(props.sampleCount)
            .fill({ x: 0.0, y: 0.0 })
            .map(() => ({ x: 0.0, y: 0.0 }));

        const channel1BorderColor = DigitalSignalView.HexToRgba(props.channelColors[0], 1.0);
        const channel1BackgroundColor = DigitalSignalView.HexToRgba(props.channelColors[0], 0.5);

        const channel2BorderColor = DigitalSignalView.HexToRgba(props.channelColors[1], 1.0);
        const channel2BackgroundColor = DigitalSignalView.HexToRgba(props.channelColors[1], 0.5);

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
            <div className="okDigitalSignalChartContainer">
                <Line
                    ref={this._ChartRef}
                    options={this._ChartOptions}
                    data={this._ChartData}
                />
            </div>
        );
    }

    /**
     * Reads samples from the Digital Signal Sampler and updates the Chart with the new data.
     * @returns Promise that resolves when the Chart has been updated with the new data.
     */
    public UpdateChartData(sampleChannels: Int16Array[]): void {
        for (let sampleIndex = 0; sampleIndex < sampleChannels[0].length; sampleIndex++) {
            this._ChartData.datasets[0].data[sampleIndex].x = sampleIndex;
            this._ChartData.datasets[0].data[sampleIndex].y = sampleChannels[0][sampleIndex];
        }

        for (let sampleIndex = 0; sampleIndex < sampleChannels[1].length; sampleIndex++) {
            this._ChartData.datasets[1].data[sampleIndex].x = sampleIndex;
            this._ChartData.datasets[1].data[sampleIndex].y = sampleChannels[1][sampleIndex];
        }

        if (this._ChartRef.current != null) {
            this._ChartRef.current.update();
        }
    }

    public async UpdateChannelEnableStates(channelEnableStates: boolean[]) {
        const signalChart = this._ChartRef.current;

        if (signalChart) {
            signalChart.data.datasets[0].hidden = !channelEnableStates[0];
            signalChart.data.datasets[1].hidden = !channelEnableStates[1];

            signalChart.update();
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

export default DigitalSignalView;
