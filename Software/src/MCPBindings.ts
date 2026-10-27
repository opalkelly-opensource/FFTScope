/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import type { WorkQueue } from "@opalkelly/frontpanel-platform-api";

import type { FrequencyVector, FrequencyVectorState, BinMapEntry } from "./WaveformGenerator";
import type { SpectrumDisplayMode } from "./SpectrumView";
import { gammaFromStops, stopsFromGamma } from "./FFTScopeView";
import type { AppMCP } from "./types/mcp";

/** wavegen_get_state result. */
export interface WavegenState {
    vectors: (FrequencyVectorState & { freqHz: number })[];
    isAutoScaleEnabled: boolean;
    amplitudeScaleFactor: number;
    amplitudeScaleDb: number;
    binMap: BinMapEntry[];
}

export interface DisplayState {
    channelEnableStates: boolean[];
    spectrumMode: SpectrumDisplayMode;
    spectrogramNoiseFloor: number;   // dBFS
    spectrogramGammaStops: number;   // 1/8-octave steps
    isContinuous: boolean;
}

export interface SampleRateInfo {
    sampleRate: number;
    binSpacingHz: number;
}

export interface McpHandlers {
    initializeWavegen: () => Promise<number>;
    setWavegenVector: (slot: number, vector: FrequencyVector, enabled: boolean) => Promise<number>;
    setWavegenAutoscale: (enabled: boolean) => Promise<number>;
    resetWavegen: () => Promise<void>;
    getWavegenState: () => WavegenState;
    getWavegenSampleRate: () => SampleRateInfo;
    resetDigitizer: () => Promise<boolean>;
    captureSamples: (refreshDisplays: boolean) => Promise<unknown>;
    getDigitizerSampleRate: () => SampleRateInfo;
    setChannelEnabled: (channelIndex: number, enabled: boolean) => void;
    setContinuous: (enabled: boolean) => void;
    setSpectrumMode: (mode: SpectrumDisplayMode) => void;
    setSpectrogramNoiseFloor: (floorDbfs: number) => void;
    setSpectrogramGammaStops: (stops: number) => void;
    getDisplayState: () => DisplayState;
    readSpectrum: () => Promise<unknown>;
    readStatus: () => Promise<unknown>;
    readConfig: () => Promise<unknown>;
}

export function registerMcpBindings(
    mcp: AppMCP,
    workQueue: WorkQueue,
    handlers: McpHandlers
): void {
    mcp.useWorkQueue(workQueue);

    mcp.register("wavegen_initialize", async () => {
        const amplitudeScaleFactor = await handlers.initializeWavegen();
        return { amplitudeScaleFactor, state: handlers.getWavegenState() };
    });

    mcp.register("wavegen_set_vector", async (args) => {
        const { slot, bin, amplitudeDbfs, enabled } = args as {
            slot: number;
            bin: number;
            amplitudeDbfs: number;
            enabled: boolean;
        };
        const amplitudeScaleFactor = await handlers.setWavegenVector(
            slot,
            { bin, amplitude: amplitudeDbfs },
            enabled
        );
        return { amplitudeScaleFactor, state: handlers.getWavegenState() };
    });

    mcp.register("wavegen_set_autoscale", async (args) => {
        const { enabled } = args as { enabled: boolean };
        const amplitudeScaleFactor = await handlers.setWavegenAutoscale(enabled);
        return { amplitudeScaleFactor };
    });

    mcp.register("wavegen_reset", async () => {
        await handlers.resetWavegen();
        return { ok: true, state: handlers.getWavegenState() };
    });

    mcp.register("wavegen_get_state", async () => handlers.getWavegenState());
    mcp.register("wavegen_get_sample_rate", async () => handlers.getWavegenSampleRate());

    mcp.register("digitizer_reset", async () => {
        const adcReady = await handlers.resetDigitizer();
        return { adcReady };
    });

    mcp.register("digitizer_capture_once", async () => handlers.captureSamples(true));
    mcp.register("digitizer_read_samples", async () => handlers.captureSamples(false));
    mcp.register("digitizer_get_sample_rate", async () => handlers.getDigitizerSampleRate());

    mcp.register("digitizer_set_continuous", async (args) => {
        const { enabled } = args as { enabled: boolean };
        handlers.setContinuous(enabled);
        return { enabled };
    });

    mcp.register("digitizer_set_channel_enabled", async (args) => {
        const { channel, enabled } = args as { channel: number; enabled: boolean };
        handlers.setChannelEnabled(channel - 1, enabled);
        return { channel, enabled };
    });

    mcp.register("digitizer_get_channel_enabled", async (args) => {
        const { channel } = args as { channel: number };
        const enabled = handlers.getDisplayState().channelEnableStates[channel - 1];
        if (enabled === undefined) throw new Error(`Invalid channel ${channel} (1..2)`);
        return { channel, enabled };
    });

    mcp.register("spectrum_set_mode", async (args) => {
        const { mode } = args as { mode: SpectrumDisplayMode };
        if (mode !== "spectrum" && mode !== "spectrogram") {
            throw new Error(`Invalid mode '${mode}' (spectrum | spectrogram)`);
        }
        handlers.setSpectrumMode(mode);
        return { mode };
    });

    mcp.register("spectrum_get_mode", async () => ({
        mode: handlers.getDisplayState().spectrumMode
    }));

    mcp.register("spectrum_set_noise_floor", async (args) => {
        const { floorDbfs } = args as { floorDbfs: number };
        handlers.setSpectrogramNoiseFloor(floorDbfs);
        return { floorDbfs: handlers.getDisplayState().spectrogramNoiseFloor };
    });

    mcp.register("spectrum_get_noise_floor", async () => ({
        floorDbfs: handlers.getDisplayState().spectrogramNoiseFloor
    }));

    mcp.register("spectrum_set_gamma", async (args) => {
        const { gamma } = args as { gamma: number };
        if (!(gamma > 0)) throw new Error(`Invalid gamma ${gamma} (0.25..4.0)`);
        handlers.setSpectrogramGammaStops(stopsFromGamma(gamma));
        return { gamma: gammaFromStops(handlers.getDisplayState().spectrogramGammaStops) };
    });

    mcp.register("spectrum_get_gamma", async () => ({
        gamma: gammaFromStops(handlers.getDisplayState().spectrogramGammaStops)
    }));

    mcp.register("spectrum_read_latest", async () => handlers.readSpectrum());

    mcp.register("status_read", async () => handlers.readStatus());
    mcp.register("config_read", async () => handlers.readConfig());

    // Flush registrations and fire tools/list_changed.
    mcp.ready();
}
