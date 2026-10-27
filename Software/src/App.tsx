/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from "react";

import * as AlertDialog from "@radix-ui/react-alert-dialog";

import "./App.css";

import {
    IDeviceManager,
    IDevice,
    IDeviceInfo,
    IFPGAConfiguration,
    IFPGADataPortAXI,
    WorkQueue,
    DataProgressCallback,
    IEventSubscription
} from "@opalkelly/frontpanel-platform-api";

import FFTScopeView, {
    SPECTROGRAM_NOISE_FLOOR_MIN,
    SPECTROGRAM_NOISE_FLOOR_MAX,
    SPECTROGRAM_NOISE_FLOOR_DEFAULT,
    SPECTROGRAM_GAMMA_STOPS_MIN,
    SPECTROGRAM_GAMMA_STOPS_MAX,
    SPECTROGRAM_GAMMA_STOPS_DEFAULT
} from "./FFTScopeView";
import { SpectrumDisplayMode } from "./SpectrumView";

import FrontPanelLogo from "../assets/images/logo512.png";

import FFTConfiguration from "./FFTConfiguration";
import { resolveADCVariant, DEFAULT_ADC_VARIANT } from "./ADCVariants";

import { DACDriver } from "./DACDriver";
import { ADCDriver, ADCState } from "./ADCDriver";
import { CaptureSequencer } from "./CaptureSequencer";

import {
    WaveformGenerator,
    FrequencyVector,
    FrequencyVectorState
} from "./WaveformGenerator";

import { DatapathCtrlDriver } from "./DatapathCtrlDriver";

import { getMCP } from "./types/mcp";
import { registerMcpBindings, WavegenState, DisplayState } from "./MCPBindings";

interface ErrorProperties { title: string, description: string, solution: string }

interface FFTScopeContext {
    adcDriver: ADCDriver;
    captureSequencer: CaptureSequencer;
    dacDriver: DACDriver;
    waveformGenerator: WaveformGenerator;
    datapathCtrl: DatapathCtrlDriver;
    spectrumConfiguration: FFTConfiguration;
    waveformConfiguration: FFTConfiguration;
    adcPresent: boolean;
    dacPresent: boolean;
}

const ADC_PRODUCT_MODEL_KEY = "SYZYGY1_PRODUCT_MODEL"; // Port B

const isDacProductModel = (modelName: string | undefined): boolean =>
    modelName !== undefined && modelName.toUpperCase().startsWith("SZG-DAC");

const DAC_SAMPLE_CLK = 125_000_000;
const SPECTRUM_FFT_LENGTH = 2048;
const DAC_IFFT_LENGTH = 2048;         // complex bins
const SAMPLE_COUNT = 2048;            // per channel, the full td_capbuf record
const ADC_FULL_SCALE = 32768;
const ADC_BIT_WIDTH = 16;             // both pods MSB-align into signed 16-bit
const FFT_OUTPUT_PEAK = (SPECTRUM_FFT_LENGTH / 2) * ADC_FULL_SCALE; // dBFS reference
const SPECTRUM_DBFS_FLOOR = -200;     // reported for zero-magnitude bins

const SLOT_COUNT = 8;                 // number of wavegen software slots
const CHANNEL_COUNT = 2;

const DEFAULT_DISPLAY_STATE: DisplayState = {
    channelEnableStates: [true, true],
    spectrumMode: "spectrum",
    spectrogramNoiseFloor: SPECTROGRAM_NOISE_FLOOR_DEFAULT,
    spectrogramGammaStops: SPECTROGRAM_GAMMA_STOPS_DEFAULT,
    isContinuous: true
};

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const toDbfs = (magnitudes: Float64Array): number[] =>
    Array.from(magnitudes, (magnitude) =>
        magnitude > 0 ? 20.0 * Math.log10(magnitude / FFT_OUTPUT_PEAK) : SPECTRUM_DBFS_FLOOR
    );
const DEFAULT_WAVEGEN_VECTORS: FrequencyVectorState[] = [
    { isEnabled: true, vector: { bin: 68, amplitude: -24 } },
    { isEnabled: true, vector: { bin: 2, amplitude: -7 } },
    { isEnabled: true, vector: { bin: 18, amplitude: -28 } },
    ...Array.from({ length: SLOT_COUNT - 3 }, () => ({
        isEnabled: false,
        vector: { bin: 1, amplitude: -120 }
    }))
];

function makeResetVectors(): FrequencyVectorState[] {
    return Array.from({ length: SLOT_COUNT }, () => ({
        isEnabled: false,
        vector: { bin: 1, amplitude: -120 }
    }));
}

function cloneVectors(vectors: FrequencyVectorState[]): FrequencyVectorState[] {
    return vectors.map((slot) => ({
        isEnabled: slot.isEnabled,
        vector: {
            bin: slot.vector.bin,
            amplitude: slot.vector.amplitude
        }
    }));
}

const DeviceWorkQueue = new WorkQueue();

function App() {
    const [fftScopeContext, setFFTScopeContext] = React.useState<FFTScopeContext>();
    const [error, setError] = React.useState<ErrorProperties>();

    const wavegenVectorsRef = React.useRef<FrequencyVectorState[]>(
        cloneVectors(DEFAULT_WAVEGEN_VECTORS)
    );
    const wavegenAutoscaleRef = React.useRef<boolean>(true);
    const [wavegenVectors, setWavegenVectors] = React.useState<FrequencyVectorState[]>(
        wavegenVectorsRef.current
    );
    const [isAutoScaleEnabled, setIsAutoScaleEnabled] = React.useState(true);
    const [amplitudeScaleFactor, setAmplitudeScaleFactor] = React.useState(1.0);

    const displayStateRef = React.useRef<DisplayState>(DEFAULT_DISPLAY_STATE);
    const [displayState, setDisplayState] = React.useState<DisplayState>(DEFAULT_DISPLAY_STATE);

    const fftScopeViewRef = React.useRef<FFTScopeView>(null);

    const contextRef = React.useRef<FFTScopeContext | undefined>(undefined);
    React.useEffect(() => {
        contextRef.current = fftScopeContext;
    }, [fftScopeContext]);

    /** Push the given vectors and autoscale setting to the hardware. */
    const applyWavegen = React.useCallback(
        async (vectors: FrequencyVectorState[], autoscale: boolean): Promise<number> => {
            let factor = 1.0;
            await DeviceWorkQueue.post(async () => {
                const ctx = contextRef.current;
                if (ctx === undefined) throw new Error("Device not ready");
                if (!ctx.dacPresent) {
                    throw new Error("Waveform generator unavailable: no DAC connected (Port A)");
                }

                const enabled: FrequencyVector[] = vectors
                    .filter((slot) => slot.isEnabled)
                    .map((slot) => slot.vector);

                factor = await ctx.waveformGenerator.SetVectors(enabled, autoscale);
                setAmplitudeScaleFactor(factor);
            });
            return factor;
        },
        []
    );

    /** Set one waveform-generator slot (vector + enable) and re-apply the spectrum. */
    const setWavegenVector = React.useCallback(
        async (slot: number, vector: FrequencyVector, enabled: boolean): Promise<number> => {
            if (slot < 0 || slot >= wavegenVectorsRef.current.length) {
                throw new Error(`Invalid slot ${slot} (0..${wavegenVectorsRef.current.length - 1})`);
            }
            const next = cloneVectors(wavegenVectorsRef.current);
            next[slot] = {
                isEnabled: enabled,
                vector: { bin: vector.bin, amplitude: vector.amplitude }
            };
            wavegenVectorsRef.current = next;
            setWavegenVectors(next);
            return applyWavegen(next, wavegenAutoscaleRef.current);
        },
        [applyWavegen]
    );

    /** Toggle autoscale and re-apply the spectrum with the new policy. */
    const setWavegenAutoscale = React.useCallback(
        async (enabled: boolean): Promise<number> => {
            wavegenAutoscaleRef.current = enabled;
            setIsAutoScaleEnabled(enabled);
            return applyWavegen(wavegenVectorsRef.current, enabled);
        },
        [applyWavegen]
    );

    /** Reset Instrument: clear hardware spectrum and return every slot to silence. */
    const resetWavegen = React.useCallback(async (): Promise<void> => {
        const next = makeResetVectors();
        wavegenVectorsRef.current = next;
        setWavegenVectors(next);
        await DeviceWorkQueue.post(async () => {
            const ctx = contextRef.current;
            if (ctx === undefined) throw new Error("Device not ready");
            if (!ctx.dacPresent) {
                throw new Error("Waveform generator unavailable: no DAC connected (Port A)");
            }
            await ctx.waveformGenerator.Reset();
            setAmplitudeScaleFactor(1.0);
        });
    }, []);

    /** Re-enable DAC playout and re-push the current slots. */
    const initializeWavegen = React.useCallback(async (): Promise<number> => {
        await DeviceWorkQueue.post(async () => {
            const ctx = contextRef.current;
            if (ctx === undefined) throw new Error("Device not ready");
            if (!ctx.dacPresent) {
                throw new Error("Waveform generator unavailable: no DAC connected (Port A)");
            }
            await ctx.dacDriver.EnablePlayback();
        });
        return applyWavegen(wavegenVectorsRef.current, wavegenAutoscaleRef.current);
    }, [applyWavegen]);

    /** Snapshot of the wavegen slots and the staged bin map. */
    const getWavegenState = React.useCallback((): WavegenState => {
        const ctx = contextRef.current;
        const scale = ctx?.waveformGenerator.AmplitudeScaleFactor ?? 1.0;
        return {
            vectors: cloneVectors(wavegenVectorsRef.current).map((slot) => ({
                ...slot,
                freqHz: (slot.vector.bin * DAC_SAMPLE_CLK) / DAC_IFFT_LENGTH
            })),
            isAutoScaleEnabled: wavegenAutoscaleRef.current,
            amplitudeScaleFactor: scale,
            amplitudeScaleDb: 20.0 * Math.log10(scale),
            binMap: ctx?.waveformGenerator.GetBinMap() ?? []
        };
    }, []);

    const getWavegenSampleRate = React.useCallback(() => ({
        sampleRate: DAC_SAMPLE_CLK,
        ifftLength: DAC_IFFT_LENGTH,
        binSpacingHz: DAC_SAMPLE_CLK / DAC_IFFT_LENGTH
    }), []);

    const getDigitizerSampleRate = React.useCallback(() => {
        const ctx = contextRef.current;
        if (ctx === undefined) throw new Error("Device not ready");
        return {
            sampleRate: ctx.spectrumConfiguration.SampleRate,
            fftLength: SPECTRUM_FFT_LENGTH,
            binSpacingHz: ctx.spectrumConfiguration.GetBinFrequency(1)
        };
    }, []);

    const updateDisplayState = React.useCallback((patch: Partial<DisplayState>): void => {
        displayStateRef.current = { ...displayStateRef.current, ...patch };
        setDisplayState(displayStateRef.current);
    }, []);

    const getDisplayState = React.useCallback((): DisplayState => displayStateRef.current, []);

    const setChannelEnabled = React.useCallback((channelIndex: number, enabled: boolean): void => {
        if (channelIndex < 0 || channelIndex >= CHANNEL_COUNT) {
            throw new Error(`Invalid channel ${channelIndex + 1} (1..${CHANNEL_COUNT})`);
        }
        const channelEnableStates = [...displayStateRef.current.channelEnableStates];
        channelEnableStates[channelIndex] = enabled;
        updateDisplayState({ channelEnableStates });
    }, [updateDisplayState]);

    const setSpectrumMode = React.useCallback((mode: SpectrumDisplayMode): void => {
        updateDisplayState({ spectrumMode: mode });
    }, [updateDisplayState]);

    const setSpectrogramNoiseFloor = React.useCallback((floorDbfs: number): void => {
        updateDisplayState({
            spectrogramNoiseFloor: clamp(floorDbfs, SPECTROGRAM_NOISE_FLOOR_MIN, SPECTROGRAM_NOISE_FLOOR_MAX)
        });
    }, [updateDisplayState]);

    const setSpectrogramGammaStops = React.useCallback((stops: number): void => {
        updateDisplayState({
            spectrogramGammaStops: clamp(stops, SPECTROGRAM_GAMMA_STOPS_MIN, SPECTROGRAM_GAMMA_STOPS_MAX)
        });
    }, [updateDisplayState]);

    const setContinuous = React.useCallback((enabled: boolean): void => {
        updateDisplayState({ isContinuous: enabled });
    }, [updateDisplayState]);

    /**
     * Realign the ADC, then resume continuous capture.
     * @returns True when the ADC reports ready.
     */
    const resetDigitizer = React.useCallback(async (): Promise<boolean> => {
        let isReady = false;
        await DeviceWorkQueue.post(async () => {
            const ctx = contextRef.current;
            if (ctx === undefined) throw new Error("Device not ready");
            if (!ctx.adcPresent) {
                throw new Error("Acquisition unavailable: no ADC connected (Port B)");
            }
            isReady = await ctx.captureSequencer.Reset();
        });
        setContinuous(true);
        return isReady;
    }, [setContinuous]);

    /**
     * Capture one ADC frame for both channels, return the raw MSB-aligned signed
     * 16-bit samples.
     * @param refreshDisplays - If true, also plot the frame and refresh the spectrum.
     */
    const captureSamples = React.useCallback(async (refreshDisplays: boolean): Promise<unknown> => {
        const ch1 = new Int16Array(SAMPLE_COUNT);
        const ch2 = new Int16Array(SAMPLE_COUNT);
        let sampleRate = 0;
        await DeviceWorkQueue.post(async () => {
            const ctx = contextRef.current;
            if (ctx === undefined) throw new Error("Device not ready");
            if (!ctx.adcPresent) {
                throw new Error("Acquisition unavailable: no ADC connected (Port B)");
            }
            // ReadSamples requires ResetComplete.
            if (ctx.captureSequencer.State !== ADCState.ResetComplete) {
                await ctx.captureSequencer.Reset();
            }
            const ok = await ctx.captureSequencer.ReadSamples([ch1, ch2]);
            if (!ok) throw new Error("ADC ReadSamples failed");
            sampleRate = ctx.spectrumConfiguration.SampleRate;
        });
        if (refreshDisplays) {
            await fftScopeViewRef.current?.OnSampleChannelsUpdate([ch1, ch2]);
        }
        return {
            sampleRate,
            sampleCount: SAMPLE_COUNT,
            adcBitWidth: ADC_BIT_WIDTH,
            ch1: Array.from(ch1),
            ch2: Array.from(ch2)
        };
    }, []);

    /** Capture one hardware FFT frame and return both channels in dBFS. */
    const readSpectrum = React.useCallback(async (): Promise<unknown> => {
        let result: unknown;
        await DeviceWorkQueue.post(async () => {
            const ctx = contextRef.current;
            if (ctx === undefined) throw new Error("Device not ready");
            if (!ctx.adcPresent) {
                throw new Error("Acquisition unavailable: no ADC connected (Port B)");
            }
            if (ctx.captureSequencer.State !== ADCState.ResetComplete) {
                await ctx.captureSequencer.Reset();
            }
            // The ADC FIFO overflows between captures, so the first frame after an
            // input change is one frame stale; capture and discard one first.
            await ctx.captureSequencer.ReadSpectrum();
            const { mag1, mag2 } = await ctx.captureSequencer.ReadSpectrum();
            result = {
                sampleRate: ctx.spectrumConfiguration.SampleRate,
                fftLength: SPECTRUM_FFT_LENGTH,
                binCount: ctx.captureSequencer.BinCount,
                binSpacingHz: ctx.spectrumConfiguration.GetBinFrequency(1),
                ch1: toDbfs(mag1),
                ch2: toDbfs(mag2)
            };
        });
        return result;
    }, []);

    /** Read and decode STATUS from datapath_ctrl, syzygy_adc and syzygy_dac. */
    const readStatus = React.useCallback(async () => {
        let result: unknown;
        await DeviceWorkQueue.post(async () => {
            const ctx = contextRef.current;
            if (ctx === undefined) throw new Error("Device not ready");
            const ctrl = await ctx.datapathCtrl.ReadStatus();
            const adc = await ctx.adcDriver.ReadStatus();
            const dac = await ctx.dacDriver.ReadStatus();
            result = {
                raw: ctrl.raw,
                adcStatus: adc.raw,
                dacStatus: dac.raw,
                captureDone: ctrl.captureDone,
                playReady: ctrl.playReady,
                adcReady: adc.ready,
                captureClkAlive: adc.captureClkAlive,
                alignDone: adc.alignDone,
                alignFail: adc.alignFail,
                fifoOverflow: adc.fifoOverflow,
                frameError: adc.frameError,
                dacReady: dac.ready,
                fifoUnderflow: dac.fifoUnderflow
            };
        });
        return result;
    }, []);

    /** Read and decode CONFIG. */
    const readConfig = React.useCallback(async () => {
        let result: unknown;
        await DeviceWorkQueue.post(async () => {
            const ctx = contextRef.current;
            if (ctx === undefined) throw new Error("Device not ready");
            result = await ctx.datapathCtrl.ReadConfig();
        });
        return result;
    }, []);

    const mcpRegisteredRef = React.useRef(false);
    React.useEffect(() => {
        if (fftScopeContext === undefined || mcpRegisteredRef.current) return;
        const mcp = getMCP();
        if (mcp === undefined) return; // MCP not granted
        mcpRegisteredRef.current = true;
        registerMcpBindings(mcp, DeviceWorkQueue, {
            initializeWavegen,
            setWavegenVector,
            setWavegenAutoscale,
            resetWavegen,
            getWavegenState,
            getWavegenSampleRate,
            resetDigitizer,
            captureSamples,
            getDigitizerSampleRate,
            setChannelEnabled,
            setContinuous,
            setSpectrumMode,
            setSpectrogramNoiseFloor,
            setSpectrogramGammaStops,
            getDisplayState,
            readSpectrum,
            readStatus,
            readConfig
        });
    }, [
        fftScopeContext,
        initializeWavegen,
        setWavegenVector,
        setWavegenAutoscale,
        resetWavegen,
        getWavegenState,
        getWavegenSampleRate,
        resetDigitizer,
        captureSamples,
        getDigitizerSampleRate,
        setChannelEnabled,
        setContinuous,
        setSpectrumMode,
        setSpectrogramNoiseFloor,
        setSpectrogramGammaStops,
        getDisplayState,
        readSpectrum,
        readStatus,
        readConfig
    ]);

    React.useEffect(() => {
        /** Loads the named bitstream (staged under the device's product name). */
        const loadFPGAConfiguration = async (productName: string, bitfileName: string, fpgaConfiguration: IFPGAConfiguration): Promise<void> => {
            const bitfileUrl = `frontpanel://localhost/assets/bitfiles/${productName}/${bitfileName}`;

            let response;
            try {
                response = await fetch(bitfileUrl);
            }
            catch {
                throw new Error(`Failed to retrieve ${bitfileUrl}`);
            }

            if (!response.ok) {
                throw new Error(`Bitfile fetch failed: HTTP ${response.status} @ ${bitfileUrl} (productName='${productName}')`);
            }

            const arrayBuffer = await response.arrayBuffer();

            const reportProgress: DataProgressCallback = () => {};

            await fpgaConfiguration.loadConfigurationFromMemory(arrayBuffer, reportProgress);
        };

        /**
         * Detects the attached SYZYGY pod(s), configures the FPGA with the
         * matching variant bitstream, and builds the AXI drivers.
         */
        const initializeDevice = async (device: IDevice): Promise<FFTScopeContext> => {
            const deviceInfo = await device.getDeviceInfo();

            console.log(`Initializing Device Product: ${deviceInfo.productName} SerialNumber: ${deviceInfo.serialNumber}`);

            // Detect the attached pods from their SmartVIO DNA before configuring
            // the FPGA. The Platform reports DNA independent of any bitstream.
            const deviceSettings = await device.getDeviceSettings();
            const settingKeys = (await deviceSettings?.getKeys()) ?? [];

            const readProductModel = async (key: string): Promise<string | undefined> => {
                try {
                    return (await deviceSettings?.getValue(key))?.toString();
                } catch {
                    return undefined;
                }
            };

            // Snapshot every SYZYGY_*_PRODUCT_MODEL reported, for diagnostics.
            const productModels = new Map<string, string | undefined>();
            for (const key of settingKeys.filter((key) => /^SYZYGY\d+_PRODUCT_MODEL$/.test(key))) {
                productModels.set(key, await readProductModel(key));
            }
            console.log(
                `SYZYGY product models: ${
                    [...productModels].map(([key, model]) => `${key}=${model ?? "<none>"}`).join(", ") ||
                    "<none reported>"
                }`
            );

            // The ADC is read from its Port B key; the DAC is matched against every
            // reported product model.
            const adcModel = productModels.get(ADC_PRODUCT_MODEL_KEY);
            const dacModel = [...productModels.values()].find(isDacProductModel);

            console.log(`Detected peripherals — DAC: ${dacModel || "<none>"}, ADC (Port B): ${adcModel || "<none>"}`);

            const adcVariant = resolveADCVariant(adcModel);
            const adcPresent = adcVariant !== undefined;
            const dacPresent = dacModel !== undefined;

            if (!adcPresent && !dacPresent) {
                throw new Error(
                    `No supported SYZYGY peripheral detected (Port A DAC reported '${dacModel ?? "<none>"}', ` +
                    `Port B ADC reported '${adcModel ?? "<none>"}'). Connect an SZG-DAC-AD911X on Port A ` +
                    `and/or an SZG-ADC-LTC2268 (14-bit) / SZG-ADC-LTC2264 (12-bit) on Port B, then restart.`
                );
            }

            // DAC-only falls back to the 14-bit build
            const variant = adcVariant ?? DEFAULT_ADC_VARIANT;

            console.log(
                `Selected ${variant.productType}: ${variant.bitfileName} @ ${variant.sampleRate / 1_000_000} MSPS` +
                (adcPresent ? "" : " (DAC-only — ADC views disabled)")
            );

            const fpgaConfiguration = device.getFPGAConfiguration();
            await loadFPGAConfiguration(deviceInfo.productName, variant.bitfileName, fpgaConfiguration);

            const fpgaDataPort: IFPGADataPortAXI = await device.getFPGADataPortAXI();

            // The two transforms run at independent rates.
            const spectrumConfiguration = new FFTConfiguration(SPECTRUM_FFT_LENGTH, variant.sampleRate);
            const waveformConfiguration = new FFTConfiguration(DAC_IFFT_LENGTH, DAC_SAMPLE_CLK);

            const datapathCtrl = new DatapathCtrlDriver(fpgaDataPort.axiLite);

            const dacDriver = new DACDriver(
                fpgaDataPort.axiLite,
                datapathCtrl,
                fpgaDataPort.axiStream,
                DAC_IFFT_LENGTH,
                100 // play_ready poll retries, 5 ms apart
            );

            const adcDriver = new ADCDriver(fpgaDataPort.axiLite);

            return {
                adcPresent,
                dacPresent,
                datapathCtrl,
                spectrumConfiguration,
                waveformConfiguration,
                dacDriver,
                adcDriver,
                captureSequencer: new CaptureSequencer(
                    datapathCtrl,
                    adcDriver,
                    fpgaDataPort.axiStream,
                    SAMPLE_COUNT,
                    SPECTRUM_FFT_LENGTH
                ),
                waveformGenerator: new WaveformGenerator(dacDriver)
            };
        };

        const targetDeviceSerialNumber = (window.FrontPanelEnv.targetDeviceSerialNumbers.length > 0) ? window.FrontPanelEnv.targetDeviceSerialNumbers[0] : "";
        const deviceManager = window.FrontPanelAPI.deviceManager;

        let device: IDevice;
        let deviceInfo: IDeviceInfo;

        let deviceDisconnectedSubscription: IEventSubscription;

        let isDisposed = false;

        DeviceWorkQueue.post(async () => {
            if (isDisposed) {
                return;
            }

            console.log(`Opening Device '${targetDeviceSerialNumber}'...`);

            await deviceManager.startMonitoring();

            // Step 1: Open the Device
            try {
                device = await deviceManager.openDevice(targetDeviceSerialNumber);

                deviceInfo = await device.getDeviceInfo();

                console.log(`Opened Device Product: ${deviceInfo.productName} SerialNumber: ${deviceInfo.serialNumber}`);
            }
            catch(error) {
                console.error(`Failed to open Device ${targetDeviceSerialNumber}: \n${error}`);

                setFFTScopeContext(undefined);
                setError({
                    title: "Failed to Open Target Device",
                    description: `Unable to open device with serial number ${targetDeviceSerialNumber}`,
                    solution: "Verify that the device is properly connected and restart the application."
                });
            }

            if(device) {
                // Step 2: Initialize the Device
                console.log(`Initializing Device '${deviceInfo.serialNumber}'...`);

                try {
                    const context = await initializeDevice(device);

                    // Bring up only the attached pods, before any view mounts:
                    // an absent pod would just burn a 500 ms realign timeout.
                    if (context.dacPresent) {
                        await context.dacDriver.EnablePlayback();
                    }
                    if (context.adcPresent) {
                        await context.captureSequencer.Reset();
                    }

                    // Push the default preset.
                    if (context.dacPresent) {
                        const enabled = wavegenVectorsRef.current
                            .filter((slot) => slot.isEnabled)
                            .map((slot) => slot.vector);
                        const factor = await context.waveformGenerator.SetVectors(
                            enabled,
                            wavegenAutoscaleRef.current
                        );
                        setAmplitudeScaleFactor(factor);
                    }

                    if (isDisposed) {
                        return;
                    }

                    contextRef.current = context;
                    setFFTScopeContext(context);
                }
                catch(error) {
                    console.error(`Failed to initialize Device ${deviceInfo.serialNumber}: \n${error}`);

                    setFFTScopeContext(undefined);
                    setError({
                        title: "Failed to Initialize Device",
                        description: `Unable to initialize ${deviceInfo.productName} with serial number ${deviceInfo.serialNumber}`,
                        solution: "Verify that the device is properly connected and restart the application."
                    });
                }

                // Step 3: Register for Device disconnection events
                const onDeviceDisconnected = async (sender: IDeviceManager, serialNumber: string) => {
                    console.info("Device Disconnected: " + serialNumber);
                    if(serialNumber === deviceInfo.serialNumber) {
                        setFFTScopeContext(undefined);
                        setError({
                            title: "Target Device Disconnected",
                            description: `${deviceInfo.productName} with serial number ${deviceInfo.serialNumber} was disconnected`,
                            solution: "Connect the target device and restart the application."
                        });
                    }
                }

                deviceDisconnectedSubscription = deviceManager.deviceDisconnectedEvent.subscribeAsync(onDeviceDisconnected);
            }
        });

        return () => {
            console.log(`App Use Effect::Cleanup`)

            isDisposed = true;
            contextRef.current = undefined;
            setFFTScopeContext(undefined);

            deviceDisconnectedSubscription?.cancel();

            DeviceWorkQueue.post(async () => {
                await deviceManager.stopMonitoring();

                console.log(`Closing Device...`);
                device?.close();
            });
        };
    }, []);

    // Event Handlers
    const onExitButtonClick = () => {
        window.close();
    }

    if (fftScopeContext !== undefined) {
        return (
            <div className="App">
                <FFTScopeView
                    ref={fftScopeViewRef}
                    name="FFTScope"
                    adcBitWidth={ADC_BIT_WIDTH}
                    fftOutputPeak={FFT_OUTPUT_PEAK}
                    captureSequencer={fftScopeContext.captureSequencer}
                    adcPresent={fftScopeContext.adcPresent}
                    dacPresent={fftScopeContext.dacPresent}
                    spectrumConfiguration={fftScopeContext.spectrumConfiguration}
                    waveformConfiguration={fftScopeContext.waveformConfiguration}
                    workQueue={DeviceWorkQueue}
                    wavegenVectors={wavegenVectors}
                    isAutoScaleEnabled={isAutoScaleEnabled}
                    amplitudeScaleFactor={amplitudeScaleFactor}
                    onWavegenVectorChange={setWavegenVector}
                    onWavegenAutoScaleChange={setWavegenAutoscale}
                    onWavegenReset={resetWavegen}
                    channelEnableStates={displayState.channelEnableStates}
                    spectrumMode={displayState.spectrumMode}
                    spectrogramNoiseFloor={displayState.spectrogramNoiseFloor}
                    spectrogramGammaStops={displayState.spectrogramGammaStops}
                    isContinuous={displayState.isContinuous}
                    onChannelEnabledChange={setChannelEnabled}
                    onSpectrumModeChange={setSpectrumMode}
                    onSpectrogramNoiseFloorChange={setSpectrogramNoiseFloor}
                    onSpectrogramGammaStopsChange={setSpectrogramGammaStops}
                    onContinuousChange={setContinuous}
                    onDigitizerReset={resetDigitizer} />
            </div>
        );
    } else {
        return (
            <div className="AppLogo">
                <img src={FrontPanelLogo} />
                <AlertDialog.Root open={(error !== undefined)}>
                    <AlertDialog.Portal>
                        <AlertDialog.Content className="AlertDialogContent">
                            <AlertDialog.Title className="AlertDialogTitle">{error?.title}</AlertDialog.Title>
                            <div style={{ height: "1px", alignSelf: "stretch", background: "#3B4046", borderRadius: "4px" }}/>
                            <AlertDialog.Description className="AlertDialogDescription">
                                {error?.description}
                            </AlertDialog.Description>
                            <div className="AlertDialogInstructions">
                                {error?.solution}
                            </div>
                            <div className="AlertDialogActionPanel">
                                <AlertDialog.Action asChild>
                                    <button
                                        className="okButton"
                                        onClick={() => onExitButtonClick()}>Exit Application</button>
                                </AlertDialog.Action>
                            </div>
                        </AlertDialog.Content>
                    </AlertDialog.Portal>
                </AlertDialog.Root>
            </div>
        );
    }
}

export default App;
