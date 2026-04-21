/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { Component, ReactNode } from "react";

import "./SpectrogramView.css";

import { MagmaLUT } from "./Colormap";
import { ADCProductConfig } from "./ADCProductConfig";

// Match the panel's 10 px padding so the gap between channels looks the
// same as the margins on either side of the spectrogram.
const CHANNEL_GUTTER_PX = 10;

interface SpectrogramViewProps {
    label: string;
    adcConfig: ADCProductConfig;
    binCount: number;
    dbFloor?: number;
    dbCeil?: number;
    gamma?: number;
}

/**
 * Scrolling spectrogram / waterfall display. Time flows downward; the newest
 * FFT row is painted at the top of each channel strip. The canvas is split
 * side-by-side: left = channel 1, right = channel 2. Each strip's full width
 * maps across the displayed FFT bins. Canvas pixel size tracks the container's
 * client size via ResizeObserver.
 */
class SpectrogramView extends Component<SpectrogramViewProps> {
    private readonly _ContainerRef: React.RefObject<HTMLDivElement>;
    private readonly _CanvasRef: React.RefObject<HTMLCanvasElement>;

    private _Context: CanvasRenderingContext2D | null = null;
    private _ResizeObserver: ResizeObserver | null = null;
    private _LeftRowImage: ImageData | null = null;
    private _RightRowImage: ImageData | null = null;

    // Ring buffer of raw FFT magnitudes per channel, so the canvas can be
    // fully repainted when the dB mapping (floor/ceil) changes without
    // waiting for the display to scroll past the stale coloring.
    private _History: [Float32Array, Float32Array] | null = null;
    private _HistoryH: number = 0;
    private _HistoryWrite: number = 0;
    private _HistoryFill: number = 0;

    constructor(props: SpectrogramViewProps) {
        super(props);
        this._ContainerRef = React.createRef();
        this._CanvasRef = React.createRef();
    }

    componentDidMount(): void {
        const canvas = this._CanvasRef.current;
        if (canvas == null) return;

        this._Context = canvas.getContext("2d", { alpha: false });

        this._ResizeObserver = new ResizeObserver(this.HandleResize);
        if (this._ContainerRef.current != null) {
            this._ResizeObserver.observe(this._ContainerRef.current);
        }

        this.SyncCanvasSize();
    }

    componentDidUpdate(prevProps: SpectrogramViewProps): void {
        if (prevProps.dbFloor !== this.props.dbFloor
                || prevProps.dbCeil !== this.props.dbCeil
                || prevProps.gamma !== this.props.gamma) {
            this.RepaintFromHistory();
        }
    }

    componentWillUnmount(): void {
        this._ResizeObserver?.disconnect();
        this._ResizeObserver = null;
    }

    render(): ReactNode {
        return (
            <div className="okSpectrogramContainer" ref={this._ContainerRef}>
                <canvas ref={this._CanvasRef} className="okSpectrogramCanvas" />
                <div className="okSpectrogramLabels">
                    <span className="okSpectrogramLabel">Channel 1</span>
                    <span className="okSpectrogramLabel">Channel 2</span>
                </div>
            </div>
        );
    }

    /**
     * Append a new frame of FFT magnitudes to the top of the spectrogram. The
     * existing image is shifted down by one pixel in each channel strip, and
     * the new magnitudes are painted as the topmost row of their strip.
     */
    public AddFrame(ch1Magnitudes: Float64Array, ch2Magnitudes: Float64Array): void {
        const ctx = this._Context;
        const canvas = this._CanvasRef.current;
        const leftRow = this._LeftRowImage;
        const rightRow = this._RightRowImage;
        if (ctx == null || canvas == null || leftRow == null || rightRow == null) return;

        const w = canvas.width;
        const h = canvas.height;
        const gutter = w >= CHANNEL_GUTTER_PX + 4 ? CHANNEL_GUTTER_PX : 0;
        const leftW = (w - gutter) >> 1;
        const rightX = leftW + gutter;
        const rightW = w - rightX;

        if (h >= 2) {
            if (leftW > 0) {
                ctx.drawImage(canvas, 0, 0, leftW, h - 1, 0, 1, leftW, h - 1);
            }
            if (rightW > 0) {
                ctx.drawImage(canvas, rightX, 0, rightW, h - 1, rightX, 1, rightW, h - 1);
            }
        }

        if (leftW > 0) {
            this.PaintRow(leftRow, ch1Magnitudes);
            ctx.putImageData(leftRow, 0, 0);
        }
        if (rightW > 0) {
            this.PaintRow(rightRow, ch2Magnitudes);
            ctx.putImageData(rightRow, rightX, 0);
        }

        this.StoreHistory(ch1Magnitudes, ch2Magnitudes);
    }

    public Clear(): void {
        const canvas = this._CanvasRef.current;
        const ctx = this._Context;
        if (canvas == null || ctx == null) return;
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        this._HistoryWrite = 0;
        this._HistoryFill = 0;
    }

    private StoreHistory(ch1Magnitudes: Float64Array, ch2Magnitudes: Float64Array): void {
        const history = this._History;
        if (history == null || this._HistoryH === 0) return;

        const binCount = this.props.binCount;
        const offset = this._HistoryWrite * binCount;
        const ch1Src = ch1Magnitudes.length >= binCount ? ch1Magnitudes.subarray(0, binCount) : ch1Magnitudes;
        const ch2Src = ch2Magnitudes.length >= binCount ? ch2Magnitudes.subarray(0, binCount) : ch2Magnitudes;
        history[0].set(ch1Src, offset);
        history[1].set(ch2Src, offset);

        this._HistoryWrite = (this._HistoryWrite + 1) % this._HistoryH;
        if (this._HistoryFill < this._HistoryH) {
            this._HistoryFill++;
        }
    }

    private RepaintFromHistory(): void {
        const ctx = this._Context;
        const canvas = this._CanvasRef.current;
        const leftRow = this._LeftRowImage;
        const rightRow = this._RightRowImage;
        const history = this._History;
        if (ctx == null || canvas == null || leftRow == null || rightRow == null || history == null) return;

        const w = canvas.width;
        const h = canvas.height;
        const gutter = w >= CHANNEL_GUTTER_PX + 4 ? CHANNEL_GUTTER_PX : 0;
        const leftW = (w - gutter) >> 1;
        const rightX = leftW + gutter;
        const rightW = w - rightX;
        const binCount = this.props.binCount;
        const H = this._HistoryH;

        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, w, h);

        const rows = Math.min(this._HistoryFill, h);
        for (let y = 0; y < rows; y++) {
            const slot = (((this._HistoryWrite - 1 - y) % H) + H) % H;
            const start = slot * binCount;
            const end = start + binCount;
            if (leftW > 0) {
                this.PaintRow(leftRow, history[0].subarray(start, end));
                ctx.putImageData(leftRow, 0, y);
            }
            if (rightW > 0) {
                this.PaintRow(rightRow, history[1].subarray(start, end));
                ctx.putImageData(rightRow, rightX, y);
            }
        }
    }

    private PaintRow(rowImage: ImageData, magnitudes: ArrayLike<number>): void {
        const data = rowImage.data;
        const w = rowImage.width;
        const dbFloor = this.props.dbFloor ?? -130;
        const dbCeil = this.props.dbCeil ?? 0;
        const dbRange = dbCeil - dbFloor;
        const invDbRange = 1 / dbRange;
        const fftOutputPeak = this.props.adcConfig.fftOutputPeak;
        const invPeak = 1 / fftOutputPeak;
        const binCount = this.props.binCount;
        const gamma = this.props.gamma ?? 1.0;
        const useGamma = Math.abs(gamma - 1.0) > 1e-6;

        for (let x = 0; x < w; x++) {
            const bin = Math.min(binCount - 1, (x * binCount / w) | 0);
            const mag = magnitudes[bin];
            const normalized = mag > 0 ? mag * invPeak : 1e-30;
            const db = 20 * Math.log10(normalized);
            let t = (db - dbFloor) * invDbRange;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
            if (useGamma) t = Math.pow(t, gamma);
            const lutIdx = ((t * 255 + 0.5) | 0) * 3;
            const off = x * 4;
            data[off    ] = MagmaLUT[lutIdx    ];
            data[off + 1] = MagmaLUT[lutIdx + 1];
            data[off + 2] = MagmaLUT[lutIdx + 2];
            data[off + 3] = 255;
        }
    }

    private HandleResize = (): void => {
        this.SyncCanvasSize();
    };

    private SyncCanvasSize(): void {
        const container = this._ContainerRef.current;
        const canvas = this._CanvasRef.current;
        const ctx = this._Context;
        if (container == null || canvas == null || ctx == null) return;

        const w = Math.max(1, Math.floor(container.clientWidth));
        const h = Math.max(2, Math.floor(container.clientHeight));

        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            const gutter = w >= CHANNEL_GUTTER_PX + 4 ? CHANNEL_GUTTER_PX : 0;
            const leftW = Math.max(1, (w - gutter) >> 1);
            const rightW = Math.max(1, w - leftW - gutter);
            this._LeftRowImage = ctx.createImageData(leftW, 1);
            this._RightRowImage = ctx.createImageData(rightW, 1);

            const binCount = this.props.binCount;
            this._History = [
                new Float32Array(h * binCount),
                new Float32Array(h * binCount)
            ];
            this._HistoryH = h;
            this._HistoryWrite = 0;
            this._HistoryFill = 0;

            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, w, h);
        }
    }
}

export default SpectrogramView;
