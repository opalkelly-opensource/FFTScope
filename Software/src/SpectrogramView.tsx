/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { Component, ReactNode } from "react";

import "./SpectrogramView.css";

import { MagmaLUT } from "./Colormap";

// Matches the panel's 10 px padding.
const CHANNEL_GUTTER_PX = 10;

interface SpectrogramViewProps {
    label: string;
    /** FFT magnitude of a full-scale sine. The dBFS reference for the display. */
    fftOutputPeak: number;
    binCount: number;
    dbFloor?: number;
    gamma?: number;
    /** Fixed canvas repaint period (ms); frames are buffered in between. */
    renderPeriodMs?: number;
}

const DEFAULT_RENDER_PERIOD_MS = 35;
const DEFAULT_DB_FLOOR = -130;

/**
 * Scrolling spectrogram / waterfall display. Time flows downward; the newest
 * FFT row is painted at the top of each channel strip. The canvas is split
 * side-by-side: left = channel 1, right = channel 2, each strip's full width
 * mapping across the displayed FFT bins.
 */
class SpectrogramView extends Component<SpectrogramViewProps> {
    private readonly _ContainerRef: React.RefObject<HTMLDivElement>;
    private readonly _CanvasRef: React.RefObject<HTMLCanvasElement>;

    private _Context: CanvasRenderingContext2D | null = null;
    private _ResizeObserver: ResizeObserver | null = null;
    private _LeftRowImage: ImageData | null = null;
    private _RightRowImage: ImageData | null = null;

    // Ring buffer of raw FFT magnitudes per channel, so the canvas can be fully
    // repainted when the dB mapping changes.
    private _History: [Float32Array, Float32Array] | null = null;
    private _HistoryH: number = 0;
    private _HistoryWrite: number = 0;
    private _HistoryFill: number = 0;

    // Frames captured but not yet drawn. The render loop scrolls the canvas by
    // this many pixels per tick, so no captured frame is dropped.
    private _PendingRows: number = 0;
    private _RenderHandle: number | null = null;
    private _LastFlushTime: number = 0;

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
        this.StartRenderLoop();
    }

    componentDidUpdate(prevProps: SpectrogramViewProps): void {
        if (prevProps.dbFloor !== this.props.dbFloor
                || prevProps.gamma !== this.props.gamma) {
            this.RepaintFromHistory();
        }
    }

    componentWillUnmount(): void {
        this.StopRenderLoop();
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
     * Store a frame of FFT magnitudes in the history ring buffer and mark it
     * pending for the next repaint.
     */
    public AddFrame(ch1Magnitudes: Float64Array, ch2Magnitudes: Float64Array): void {
        if (this._History == null || this._HistoryH === 0) return;
        this.StoreHistory(ch1Magnitudes, ch2Magnitudes);
        if (this._PendingRows < this._HistoryH) {
            this._PendingRows++;
        }
    }

    /**
     * Drive canvas repaints via requestAnimationFrame, throttled to
     * renderPeriodMs; each tick flushes whatever accumulated in between.
     */
    private StartRenderLoop(): void {
        if (this._RenderHandle != null) return;
        const tick = (now: number): void => {
            if (this._RenderHandle == null) return;
            const period = this.props.renderPeriodMs ?? DEFAULT_RENDER_PERIOD_MS;
            if (this._PendingRows > 0 && now - this._LastFlushTime >= period) {
                this._LastFlushTime = now;
                this.FlushPending();
            }
            this._RenderHandle = requestAnimationFrame(tick);
        };
        this._RenderHandle = requestAnimationFrame(tick);
    }

    private StopRenderLoop(): void {
        if (this._RenderHandle != null) {
            cancelAnimationFrame(this._RenderHandle);
            this._RenderHandle = null;
        }
    }

    /**
     * Paint every frame buffered since the last flush: scroll the existing image
     * down by the pending row count in one drawImage per channel strip, then paint
     * the newest rows from history.
     */
    private FlushPending(): void {
        const ctx = this._Context;
        const canvas = this._CanvasRef.current;
        const leftRow = this._LeftRowImage;
        const rightRow = this._RightRowImage;
        const history = this._History;
        if (ctx == null || canvas == null || leftRow == null || rightRow == null || history == null) {
            this._PendingRows = 0;
            return;
        }

        const w = canvas.width;
        const h = canvas.height;
        const n = Math.min(this._PendingRows, h);
        this._PendingRows = 0;
        if (n <= 0) return;

        const gutter = w >= CHANNEL_GUTTER_PX + 4 ? CHANNEL_GUTTER_PX : 0;
        const leftW = (w - gutter) >> 1;
        const rightX = leftW + gutter;
        const rightW = w - rightX;
        const binCount = this.props.binCount;
        const H = this._HistoryH;

        // When n >= h the whole strip is overwritten below, so skip the scroll.
        if (n < h) {
            if (leftW > 0) {
                ctx.drawImage(canvas, 0, 0, leftW, h - n, 0, n, leftW, h - n);
            }
            if (rightW > 0) {
                ctx.drawImage(canvas, rightX, 0, rightW, h - n, rightX, n, rightW, h - n);
            }
        }

        // Paint the n most recent history rows, newest at the top (y = 0).
        for (let y = 0; y < n; y++) {
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

        // The canvas is now in sync with history, so drop the backlog.
        this._PendingRows = 0;
    }

    private PaintRow(rowImage: ImageData, magnitudes: ArrayLike<number>): void {
        const data = rowImage.data;
        const w = rowImage.width;
        const dbFloor = this.props.dbFloor ?? DEFAULT_DB_FLOOR;
        // The display ceiling is fixed at 0 dBFS (full scale), so the mapped
        // range is simply -dbFloor.
        const invDbRange = 1 / -dbFloor;
        const fftOutputPeak = this.props.fftOutputPeak;
        const invPeak = 1 / fftOutputPeak;
        const binCount = this.props.binCount;
        const gamma = this.props.gamma ?? 1.0;
        const useGamma = Math.abs(gamma - 1.0) > 1e-6;

        for (let x = 0; x < w; x++) {
            const bin = Math.min(binCount - 1, (x * binCount / w) | 0);
            const mag = magnitudes[bin];
            const normalized = mag > 0 ? mag * invPeak : 1e-30; // floor keeps log10 finite
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
            this._PendingRows = 0;

            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, w, h);
        }
    }
}

export default SpectrogramView;
