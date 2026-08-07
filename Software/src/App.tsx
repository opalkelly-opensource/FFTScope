/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from "react";

import * as AlertDialog from "@radix-ui/react-alert-dialog";

import "./App.css";

import "./FPGAConfigurationFiles";

import {
    IDeviceManager,
    IDevice,
    IDeviceInfo,
    IFPGAConfiguration,
    WorkQueue,
    DataProgressCallback,
    ByteCount,
    IEventSubscription,
    DeviceInterfaceType
} from "@opalkelly/frontpanel-platform-api";

import FFTScopeView from "./FFTScopeView";

import { FrequencyVectorState } from "./WaveformGeneratorView";
import type SpectrumAnalyzerView from "./SpectrumAnalyzerView";
import type TimeDomainView from "./TimeDomainView";
import type { SpectrumDisplayMode } from "./SpectrumAnalyzerView";

import FrontPanelLogo from "../assets/images/logo512.png";

import { DACProductType, ProductModelToDACType } from "./DACProductConfig";
import { ADCProductType, ProductModelToADCType, ADCChipTable, BitfileTable, ADCProductConfig } from "./ADCProductConfig";
import FFTConfiguration from "./FFTConfiguration";

import { WaveformGeneratorDriver } from "./WaveformGeneratorDriver";
import { DigitizerDriver } from "./DigitizerDriver";
import { SpectrumAnalyzerDriver } from "./SpectrumAnalyzerDriver";

import { ClassicWaveformGeneratorDriver } from "./ClassicWaveformGeneratorDriver";
import { ClassicDigitizerDriver } from "./ClassicDigitizerDriver";
import { ClassicSpectrumAnalyzerDriver } from "./ClassicSpectrumAnalyzerDriver";

import { AXIWaveformGeneratorDriver } from "./AXIWaveformGeneratorDriver";
import { AXIDigitizerDriver } from "./AXIDigitizerDriver";
import { AXISpectrumAnalyzerDriver } from "./AXISpectrumAnalyzerDriver";

import { WaveformGeneratorAdapter, FrequencyVector } from "./WaveformGeneratorAdapter";

import { registerMcpBindings } from "./MCPBindings";

interface FFTScopeContext {
    adcConfig: ADCProductConfig;
    waveformGeneratorDriver?: WaveformGeneratorDriver;
    digitizerDriver?: DigitizerDriver;
    spectrumAnalyzerDriver?: SpectrumAnalyzerDriver;
}

type PeripheralTopology =
    | { kind: "complete"; dac: DACProductType; adc: ADCProductType }
    | { kind: "dacOnly";  dac: DACProductType }
    | { kind: "adcOnly";  adc: ADCProductType }
    | { kind: "unsafe";   port: "A" | "B"; detectedModel: string }
    | { kind: "missing" };

type SafeTopology = Exclude<PeripheralTopology, { kind: "unsafe" | "missing" }>;

interface ErrorProperties { title: string, description: string, details: string, solution: string }

const DeviceWorkQueue = new WorkQueue();

const SAMPLE_COUNT = 1024;
const FFT_LENGTH = 1024;
const DIGITIZER_UPDATE_PERIOD_MS = 35;
const CHANNEL_COLORS = ["#EF2424", "#2E7CE9"];

const INITIAL_VECTORS: FrequencyVectorState[] = [
    { isEnabled: true,  vector: { bin: 68, amplitude: -24 } },
    { isEnabled: true,  vector: { bin: 2,  amplitude: -7  } },
    { isEnabled: true,  vector: { bin: 18, amplitude: -28 } },
    { isEnabled: false, vector: { bin: 1,  amplitude: 0   } },
    { isEnabled: false, vector: { bin: 1,  amplitude: 0   } },
    { isEnabled: false, vector: { bin: 1,  amplitude: 0   } },
    { isEnabled: false, vector: { bin: 1,  amplitude: 0   } },
    { isEnabled: false, vector: { bin: 1,  amplitude: 0   } }
];

function App() {
    const [fftScopeContext, setFFTScopeContext] = React.useState<FFTScopeContext>();
    const [error, setError] = React.useState<ErrorProperties>();

    // ──────────────────────────────────────────────────────────────────
    // Lifted state — every slice that an MCP write tool mutates lives
    // here, so UI controls and MCP handlers route through one shared
    // function per action and can never drift out of sync. See README's
    // "Sharing state between UI and MCP handlers" section.
    // ──────────────────────────────────────────────────────────────────

    const [frequencyVectors, setFrequencyVectors] = React.useState<FrequencyVectorState[]>(INITIAL_VECTORS);
    const [autoscaleEnabled, setAutoscaleEnabledState] = React.useState<boolean>(true);
    const [amplitudeScaleFactor, setAmplitudeScaleFactor] = React.useState<number>(1.0);

    const [channelEnableStates, setChannelEnableStates] = React.useState<boolean[]>([true, true]);
    const [continuousEnabled, setContinuousEnabledState] = React.useState<boolean>(true);

    const [spectrumMode, setSpectrumModeState] = React.useState<SpectrumDisplayMode>("spectrum");
    const [spectrogramNoiseFloor, setSpectrogramNoiseFloorState] = React.useState<number>(-130);
    const [spectrogramGammaStops, setSpectrogramGammaStopsState] = React.useState<number>(0);

    // ──────────────────────────────────────────────────────────────────
    // Mirrors of state into refs. Shared handlers below are
    // useCallback(empty-deps) so they keep stable identities for the
    // MCP binding layer; reading current state through refs lets them
    // see the latest value at invocation time without re-registering.
    // ──────────────────────────────────────────────────────────────────

    // React-mirror ref (last value committed via setFrequencyVectors).
    // Used by UI-level callbacks that need to read "the slot the user
    // is editing right now."
    const vectorsRef = React.useRef<FrequencyVectorState[]>(INITIAL_VECTORS);
    React.useEffect(() => { vectorsRef.current = frequencyVectors; }, [frequencyVectors]);

    // Gateware-side source-of-truth, mutated *inside* DeviceWorkQueue
    // tasks only. Consecutive `applyVectorEdit` calls reconcile against
    // this ref rather than `vectorsRef`, which avoids a stale-`previous`
    // race when two MCP write calls arrive faster than React commits.
    const committedVectorsRef = React.useRef<FrequencyVectorState[]>(
        INITIAL_VECTORS.map((slot) => ({ isEnabled: slot.isEnabled, vector: { ...slot.vector } }))
    );

    const autoscaleEnabledRef = React.useRef<boolean>(autoscaleEnabled);
    React.useEffect(() => { autoscaleEnabledRef.current = autoscaleEnabled; }, [autoscaleEnabled]);

    const channelEnableStatesRef = React.useRef<boolean[]>(channelEnableStates);
    React.useEffect(() => { channelEnableStatesRef.current = channelEnableStates; }, [channelEnableStates]);

    const continuousEnabledRef = React.useRef<boolean>(continuousEnabled);
    React.useEffect(() => { continuousEnabledRef.current = continuousEnabled; }, [continuousEnabled]);

    const spectrumModeRef = React.useRef<SpectrumDisplayMode>(spectrumMode);
    React.useEffect(() => { spectrumModeRef.current = spectrumMode; }, [spectrumMode]);

    const spectrogramNoiseFloorRef = React.useRef<number>(spectrogramNoiseFloor);
    React.useEffect(() => { spectrogramNoiseFloorRef.current = spectrogramNoiseFloor; }, [spectrogramNoiseFloor]);

    const spectrogramGammaStopsRef = React.useRef<number>(spectrogramGammaStops);
    React.useEffect(() => { spectrogramGammaStopsRef.current = spectrogramGammaStops; }, [spectrogramGammaStops]);

    const amplitudeScaleFactorRef = React.useRef<number>(amplitudeScaleFactor);
    React.useEffect(() => { amplitudeScaleFactorRef.current = amplitudeScaleFactor; }, [amplitudeScaleFactor]);

    // Driver refs — written from initializeDevice without going through
    // React state so the shared handlers can read whatever driver is
    // currently bound. Set to undefined on disconnect so handlers throw
    // a useful error rather than silently no-op.
    const waveformDriverRef = React.useRef<WaveformGeneratorDriver | undefined>(undefined);
    const digitizerDriverRef = React.useRef<DigitizerDriver | undefined>(undefined);
    const spectrumDriverRef = React.useRef<SpectrumAnalyzerDriver | undefined>(undefined);

    // Adapter that mediates between the dBFS amplitude / bin shape
    // exposed by the UI and MCP layer and the IFFT bin registers the
    // gateware understands. Created in initializeDevice once the
    // waveform driver is in ResetComplete; cleared on disconnect.
    const waveformAdapterRef = React.useRef<WaveformGeneratorAdapter | undefined>(undefined);

    // Buffers shared with the views. The digitizer view's capture loop
    // writes into `digitizerSampleBuffers`; the spectrum view's
    // ComputeSpectrum writes into `spectrumOutputBuffers`. The MCP
    // `digitizer_read_samples` and `spectrum_read_latest` tools read
    // from these same buffers — serializing reads against captures via
    // the WorkQueue means the snapshot is always coherent.
    const digitizerSampleBuffersRef = React.useRef<Int16Array[]>([
        new Int16Array(SAMPLE_COUNT),
        new Int16Array(SAMPLE_COUNT)
    ]);
    const spectrumOutputBuffersRef = React.useRef<Float64Array[]>([
        new Float64Array(FFT_LENGTH),
        new Float64Array(FFT_LENGTH)
    ]);

    // Chip-specific FFT full-scale peak — used by the
    // `spectrum_read_latest` MCP handler to convert raw magnitudes to
    // dBFS. Set when initializeDevice resolves the ADC config; left at
    // 1 (a sentinel that produces 0 dBFS) until then.
    const fftOutputPeakRef = React.useRef<number>(1);

    // FPGA-supplied sample rate (DAC and ADC share the same clock in
    // FFTScope's bitfiles) and IFFT/FFT length. Exposed via the MCP
    // sample-rate getters so scripts can convert bin indices ↔ Hz.
    const sampleRateHzRef = React.useRef<number>(0);
    const fftLengthRef = React.useRef<number>(FFT_LENGTH);

    // Refs to child views for downstream chart refreshes after a
    // capture. The spectrum view is also the source-of-truth for the
    // most recent FFT magnitudes — its UpdateChartData fills the
    // spectrum output buffers in place.
    const spectrumViewRef = React.useRef<SpectrumAnalyzerView>(null);
    const timeDomainViewRef = React.useRef<TimeDomainView>(null);

    // ──────────────────────────────────────────────────────────────────
    // Shared handlers — every UI control and every state-mutating MCP
    // tool calls one of these. Each posts to DeviceWorkQueue for
    // gateware I/O, mutates React state, and (for waveform vectors)
    // updates the adapter's internal map. UI and MCP cannot drift on
    // the success path because there is exactly one place per action
    // where the gateware and React state are updated.
    // ──────────────────────────────────────────────────────────────────

    /**
     * Push the saved vectors to the gateware after a fresh init/reset.
     * Caller must already be inside a DeviceWorkQueue task (this
     * function does not post).
     */
    const seedAdapterFromVectors = React.useCallback(
        async (adapter: WaveformGeneratorAdapter): Promise<number> => {
            const slots = committedVectorsRef.current;
            slots
                .filter((slot) => slot.isEnabled)
                .forEach((slot) => adapter.AddFrequencyVector(slot.vector));
            return adapter.UpdateFrequencyBins(autoscaleEnabledRef.current);
        },
        []
    );

    const setWaveformInitialize = React.useCallback(async (): Promise<void> => {
        const driver = waveformDriverRef.current;
        if (driver === undefined) {
            throw new Error("Waveform Generator driver not available (device disconnected?)");
        }
        await DeviceWorkQueue.post(async () => {
            await driver.Initialize();
            await driver.Reset();
            const adapter = new WaveformGeneratorAdapter(driver);
            const scale = await seedAdapterFromVectors(adapter);
            waveformAdapterRef.current = adapter;
            setAmplitudeScaleFactor(scale);
        });
    }, [seedAdapterFromVectors]);

    const setWaveformReset = React.useCallback(async (): Promise<void> => {
        const driver = waveformDriverRef.current;
        const adapter = waveformAdapterRef.current;
        if (driver === undefined || adapter === undefined) {
            throw new Error("Waveform Generator not available (device disconnected?)");
        }
        const cleared: FrequencyVectorState[] = Array.from(
            { length: INITIAL_VECTORS.length },
            () => ({ isEnabled: false, vector: { bin: 0, amplitude: 0 } })
        );
        await DeviceWorkQueue.post(async () => {
            await adapter.Reset();
            committedVectorsRef.current = cleared;
        });
        setFrequencyVectors(cleared);
        setAmplitudeScaleFactor(1.0);
    }, []);

    const setAutoscale = React.useCallback(async (enabled: boolean): Promise<void> => {
        const adapter = waveformAdapterRef.current;
        if (adapter === undefined) {
            throw new Error("Waveform Generator not available (device disconnected?)");
        }
        let newScale = amplitudeScaleFactorRef.current;
        await DeviceWorkQueue.post(async () => {
            newScale = await adapter.UpdateFrequencyBins(enabled);
        });
        setAutoscaleEnabledState(enabled);
        setAmplitudeScaleFactor(newScale);
    }, []);

    /**
     * Atomic vector slot edit: the popover's separate "change vector"
     * and "toggle enable" interactions, plus the MCP `waveform_set_vector`
     * tool, all funnel through this. Reconciles the previous slot state
     * (was-enabled, was-vector) with the new slot state (will-enabled,
     * will-vector) by removing the previous vector from the adapter if
     * it was contributing and adding the new one if the new state is
     * enabled.
     *
     * The "previous" slot state is read from `committedVectorsRef`
     * inside the WorkQueue task — not from the React-mirror ref —
     * because two consecutive MCP calls can arrive faster than React
     * commits, and the queue is the only thing that serializes against
     * the gateware.
     */
    const applyVectorEdit = React.useCallback(
        async (vectorId: number, newVector: FrequencyVector, newEnabled: boolean): Promise<void> => {
            const adapter = waveformAdapterRef.current;
            if (adapter === undefined) {
                throw new Error("Waveform Generator not available (device disconnected?)");
            }

            let newScale = amplitudeScaleFactorRef.current;
            await DeviceWorkQueue.post(async () => {
                const previous = committedVectorsRef.current[vectorId];
                if (previous === undefined) {
                    throw new Error(`Invalid vector_id: ${vectorId}`);
                }
                if (previous.isEnabled) {
                    await adapter.RemoveFrequencyVector(previous.vector);
                }
                if (newEnabled) {
                    adapter.AddFrequencyVector(newVector);
                }
                newScale = await adapter.UpdateFrequencyBins(autoscaleEnabledRef.current);
                committedVectorsRef.current[vectorId] = {
                    isEnabled: newEnabled,
                    vector: { ...newVector }
                };
            });

            setFrequencyVectors((prev) => {
                const next = prev.slice();
                next[vectorId] = { isEnabled: newEnabled, vector: newVector };
                return next;
            });
            setAmplitudeScaleFactor(newScale);
        },
        []
    );

    const onVectorChange = React.useCallback(
        (vectorId: number, vector: FrequencyVector): void => {
            const previous = vectorsRef.current[vectorId];
            applyVectorEdit(vectorId, vector, previous?.isEnabled ?? false).catch((error) => {
                console.error("Vector change failed:", error);
            });
        },
        [applyVectorEdit]
    );

    const onVectorEnabledChange = React.useCallback(
        (vectorId: number, enabled: boolean): void => {
            const previous = vectorsRef.current[vectorId];
            if (previous === undefined) return;
            applyVectorEdit(vectorId, previous.vector, enabled).catch((error) => {
                console.error("Vector enable change failed:", error);
            });
        },
        [applyVectorEdit]
    );

    const onChannelEnableStateChange = React.useCallback(
        (channelIndex: number, enabled: boolean): void => {
            setChannelEnableStates((prev) => {
                const next = prev.slice();
                next[channelIndex] = enabled;
                return next;
            });
        },
        []
    );

    const setContinuousEnabled = React.useCallback((enabled: boolean): void => {
        setContinuousEnabledState(enabled);
    }, []);

    const setDigitizerReset = React.useCallback(async (): Promise<void> => {
        const driver = digitizerDriverRef.current;
        if (driver === undefined) {
            throw new Error("Digitizer driver not available (device disconnected?)");
        }
        await DeviceWorkQueue.post(async () => {
            await driver.Reset();
        });
    }, []);

    /**
     * Single sample read. Posts a ReadSamples to the WorkQueue, then
     * synchronously hands the buffer pair to the time-domain chart
     * and (asynchronously) to the spectrum analyzer for FFT + chart
     * update. Both UI controls (Capture button) and MCP
     * (`digitizer_capture_once`) call this.
     */
    const captureOnce = React.useCallback(async (): Promise<void> => {
        const driver = digitizerDriverRef.current;
        if (driver === undefined) {
            throw new Error("Digitizer driver not available (device disconnected?)");
        }
        const buffers = digitizerSampleBuffersRef.current;
        await DeviceWorkQueue.post(async () => {
            try {
                await driver.ReadSamples(buffers);
            } catch (error) {
                console.error(`Failed to Read Samples from Digitizer: \n${error}`);
            }
        });
        timeDomainViewRef.current?.UpdateChartData(buffers);
        await spectrumViewRef.current?.UpdateChartData(buffers);
    }, []);

    const setSpectrumMode = React.useCallback((mode: SpectrumDisplayMode): void => {
        setSpectrumModeState(mode);
    }, []);

    const setSpectrogramNoiseFloor = React.useCallback((value: number): void => {
        setSpectrogramNoiseFloorState(value);
    }, []);

    const setSpectrogramGammaStops = React.useCallback((value: number): void => {
        setSpectrogramGammaStopsState(value);
    }, []);

    // Continuous-capture loop. Reads driven by the lifted
    // `continuousEnabled` state, so flipping it from either the UI
    // toggle or the MCP `digitizer_set_continuous` tool starts/stops
    // the loop the same way.
    React.useEffect(() => {
        if (!continuousEnabled) return;
        if (fftScopeContext?.digitizerDriver === undefined) return;

        let active = true;
        const loop = async () => {
            if (!active) return;
            const start = performance.now();
            await captureOnce();
            const elapsed = performance.now() - start;
            if (active) {
                const delay = Math.max(DIGITIZER_UPDATE_PERIOD_MS - elapsed, 10);
                setTimeout(loop, delay);
            }
        };
        loop();
        return () => { active = false; };
    }, [continuousEnabled, fftScopeContext?.digitizerDriver, captureOnce]);

    // Mirror channel-enable changes into the time-domain chart. The
    // spectrum view tracks this via its own componentDidUpdate.
    React.useEffect(() => {
        timeDomainViewRef.current?.UpdateChannelEnableStates(channelEnableStates);
    }, [channelEnableStates]);

    React.useEffect(() => {
        const loadFPGAConfiguration = async (filename: string, fpgaConfiguration: IFPGAConfiguration): Promise<void> => {
            let response;

            try {
                response = await fetch("frontpanel://localhost/assets/bitfiles/" + filename);
            }
            catch (error) {
                throw new Error(`Failed to retrieve ${filename}`);
            }

            if (!response.ok) {
                console.error(`Fetch response error status: ${response.ok}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            const reportProgress: DataProgressCallback = (total: ByteCount, completed: ByteCount) => {
                console.log("Configuration Progress: ", completed, " of ", total);
            };

            await fpgaConfiguration.loadConfigurationFromMemory(arrayBuffer, reportProgress);
        };

        const initializeDevice = async (device: IDevice, topology: SafeTopology): Promise<FFTScopeContext> => {
            const deviceInfo = await device.getDeviceInfo();

            console.log(`Initializing Device Product: ${deviceInfo.productName} SerialNumber: ${deviceInfo.serialNumber}`);

            const effectiveAdc: ADCProductType = "adc" in topology ? topology.adc : ADCProductType.SZG_ADC_LTC2268;

            const boardBitfiles = BitfileTable[deviceInfo.productName];
            if (!boardBitfiles) {
                throw new Error(`Unsupported board "${deviceInfo.productName}": no bitfile entry in BitfileTable`);
            }
            const bitfile = boardBitfiles[effectiveAdc];

            console.log(`Configuring bitfile: ${bitfile.path}`);

            const fpgaConfiguration = device.getFPGAConfiguration();

            await loadFPGAConfiguration(bitfile.path, fpgaConfiguration);

            const chip = ADCChipTable[effectiveAdc];
            const adcConfiguration: ADCProductConfig = {
                sampleRate:    bitfile.sampleRate,
                adcBitWidth:   chip.adcBitWidth,
                fftOutputPeak: chip.fftOutputPeak
            };

            const fftConfiguration = new FFTConfiguration(FFT_LENGTH, adcConfiguration.sampleRate);

            const hasDac = topology.kind !== "adcOnly";
            const hasAdc = topology.kind !== "dacOnly";

            if(deviceInfo.interfaceType === DeviceInterfaceType.GEN3) {
                console.log("Initializing AXI driver...");

                const fpgaDataPort = await device.getFPGADataPortAXI();

                return {
                    adcConfig: adcConfiguration,
                    waveformGeneratorDriver: hasDac ? new AXIWaveformGeneratorDriver(fpgaDataPort, fftConfiguration, 100) : undefined,
                    digitizerDriver:         hasAdc ? new AXIDigitizerDriver(fpgaDataPort, 4, SAMPLE_COUNT)               : undefined,
                    spectrumAnalyzerDriver:  hasAdc ? new AXISpectrumAnalyzerDriver(fpgaDataPort, fftConfiguration, 8)     : undefined,
                };
            }

            console.log("Initializing Classic driver...");

            const fpgaDataPort = await device.getFPGADataPortClassic();

            return {
                adcConfig: adcConfiguration,
                waveformGeneratorDriver: hasDac ? new ClassicWaveformGeneratorDriver(fpgaDataPort, fftConfiguration, 100) : undefined,
                digitizerDriver:         hasAdc ? new ClassicDigitizerDriver(fpgaDataPort, 4, SAMPLE_COUNT)                : undefined,
                spectrumAnalyzerDriver:  hasAdc ? new ClassicSpectrumAnalyzerDriver(fpgaDataPort, fftConfiguration, 8)     : undefined,
            };
        };

        const classifyTopology = (dacModel: string | undefined, adcModel: string | undefined): PeripheralTopology => {
            const dac = ProductModelToDACType(dacModel);
            const adc = ProductModelToADCType(adcModel);

            if (dac && adcModel && !adc) {
                return { kind: "unsafe", port: "B", detectedModel: adcModel };
            }
            if (adc && dacModel && !dac) {
                return { kind: "unsafe", port: "A", detectedModel: dacModel };
            }

            if (dac && adc) return { kind: "complete", dac, adc };
            if (dac)        return { kind: "dacOnly",  dac };
            if (adc)        return { kind: "adcOnly",  adc };
            return { kind: "missing" };
        };

        const targetDeviceSerialNumber = (window.FrontPanelEnv.targetDeviceSerialNumbers.length > 0) ? window.FrontPanelEnv.targetDeviceSerialNumbers[0] : "";
        const deviceManager = window.FrontPanelAPI.deviceManager;

        let device: IDevice;
        let deviceInfo: IDeviceInfo;

        let deviceDisconnectedSubscription: IEventSubscription;

        DeviceWorkQueue.post(async () => {
            console.log(`Opening Device '${targetDeviceSerialNumber}'...`);

            await deviceManager.startMonitoring();

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
                    details: `${error}`,
                    solution: "Verify that the device is properly connected and restart the application."
                });
            }

            if(device) {
                let topology: PeripheralTopology | undefined;
                let peripheralQueryError: unknown;

                try {
                    const deviceSettings = await device.getDeviceSettings();

                    const dacPeripheralModel = await deviceSettings?.getValue("SYZYGY0_PRODUCT_MODEL");
                    const adcPeripheralModel = await deviceSettings?.getValue("SYZYGY1_PRODUCT_MODEL");

                    console.log(`Detected on Port A: ${dacPeripheralModel || "<empty>"}`);
                    console.log(`Detected on Port B: ${adcPeripheralModel || "<empty>"}`);

                    topology = classifyTopology(dacPeripheralModel?.toString(), adcPeripheralModel?.toString());
                }
                catch(error) {
                    peripheralQueryError = error;
                    console.error(`Failed to query peripherals on Device ${deviceInfo.serialNumber}: \n${error}`);
                }

                if(topology) {
                    switch(topology.kind) {
                        case "unsafe": {
                            const foreignPort = topology.port;
                            const supportedPort = foreignPort === "B" ? "A" : "B";
                            const supportedKind = foreignPort === "B" ? "DAC" : "ADC";

                            console.error(`Refusing to configure FPGA: Port ${foreignPort} has unsupported peripheral "${topology.detectedModel}" while supported ${supportedKind} is on Port ${supportedPort}`);

                            setFFTScopeContext(undefined);
                            setError({
                                title: "Unsafe peripheral configuration",
                                description: `Port ${foreignPort} has an unsupported peripheral ("${topology.detectedModel}") while a supported ${supportedKind} is present on Port ${supportedPort}.`,
                                details: `The FFTScope bitfile drives IOs on both Port A and Port B. Configuring the FPGA in this state may damage the peripheral on Port ${foreignPort}.`,
                                solution: `Disconnect the peripheral on Port ${foreignPort} (or replace it with a supported peripheral) and restart the application.`
                            });
                            break;
                        }
                        case "missing": {
                            console.error(`Failed to find DAC connected to port A or ADC connected on port B of Device ${deviceInfo.serialNumber}`);

                            setFFTScopeContext(undefined);
                            setError({
                                title: "Failed to find DAC or ADC peripheral",
                                description: `Unable to find supported DAC connected on port A or ADC connected on port B of ${deviceInfo.productName} with serial number ${deviceInfo.serialNumber}`,
                                details: "",
                                solution: "Verify that the SZG-DAC-AD9116 (or legacy POD-DAC-AD9116) is connected on port A and/or the SZG-ADC-LTC2268 or SZG-ADC-LTC2264 is connected on port B of the device and restart the application."
                            });
                            break;
                        }
                        case "complete":
                        case "dacOnly":
                        case "adcOnly": {
                            console.log(`Initializing Device '${deviceInfo.serialNumber}'...`);

                            try {
                                const drivers = await initializeDevice(device, topology);

                                await drivers.waveformGeneratorDriver?.Initialize();
                                await drivers.waveformGeneratorDriver?.Reset();
                                await drivers.digitizerDriver?.Reset();

                                waveformDriverRef.current = drivers.waveformGeneratorDriver;
                                digitizerDriverRef.current = drivers.digitizerDriver;
                                spectrumDriverRef.current = drivers.spectrumAnalyzerDriver;
                                fftOutputPeakRef.current = drivers.adcConfig.fftOutputPeak;
                                sampleRateHzRef.current = drivers.adcConfig.sampleRate;

                                if (drivers.waveformGeneratorDriver) {
                                    const adapter = new WaveformGeneratorAdapter(drivers.waveformGeneratorDriver);
                                    const initialScale = await seedAdapterFromVectors(adapter);
                                    waveformAdapterRef.current = adapter;
                                    setAmplitudeScaleFactor(initialScale);
                                } else {
                                    waveformAdapterRef.current = undefined;
                                }

                                setFFTScopeContext(drivers);

                                // Expose the 21 FFTScope tools to the
                                // Platform's AppToolDispatcher. No-op
                                // when bindings weren't granted at
                                // launch — `getMCP()` returns undefined
                                // and AI calls never reach this app.
                                //
                                // Registration runs *after* the driver
                                // refs and sample-rate refs are set
                                // (above), so MCP read tools never
                                // observe pre-init zeros.
                                try {
                                    await registerMcpBindings({
                                        workQueue: DeviceWorkQueue,
                                        drivers: {
                                            waveform: waveformDriverRef,
                                            digitizer: digitizerDriverRef,
                                            spectrum: spectrumDriverRef
                                        },
                                        handlers: {
                                            waveformInitialize: setWaveformInitialize,
                                            waveformReset: setWaveformReset,
                                            applyVectorEdit,
                                            setAutoscale,
                                            digitizerReset: setDigitizerReset,
                                            captureOnce,
                                            setChannelEnabled: onChannelEnableStateChange,
                                            setContinuousEnabled,
                                            setSpectrumMode,
                                            setSpectrogramNoiseFloor,
                                            setSpectrogramGammaStops
                                        },
                                        state: {
                                            amplitudeScaleFactor: amplitudeScaleFactorRef,
                                            channelEnableStates: channelEnableStatesRef,
                                            spectrumMode: spectrumModeRef,
                                            spectrogramNoiseFloor: spectrogramNoiseFloorRef,
                                            spectrogramGammaStops: spectrogramGammaStopsRef,
                                            digitizerSampleBuffers: digitizerSampleBuffersRef,
                                            spectrumOutputBuffers: spectrumOutputBuffersRef,
                                            fftOutputPeak: fftOutputPeakRef,
                                            sampleRateHz: sampleRateHzRef,
                                            fftLength: fftLengthRef,
                                            committedVectors: committedVectorsRef
                                        }
                                    });
                                } catch (mcpError) {
                                    console.error("MCP binding registration failed:", mcpError);
                                }
                            }
                            catch(error) {
                                console.error(`Failed to initialize Device ${deviceInfo.serialNumber}: \n${error}`);

                                setFFTScopeContext(undefined);
                                setError({
                                    title: "Failed to Initialize Device",
                                    description: `Unable to initialize ${deviceInfo.productName} with serial number ${deviceInfo.serialNumber}`,
                                    details: `${error}`,
                                    solution: "Verify that the device is properly connected and restart the application."
                                });
                            }

                            const onDeviceDisconnected = async (sender: IDeviceManager, serialNumber: string) => {
                                console.info("Device Disconnected: " + serialNumber);
                                if(serialNumber === deviceInfo.serialNumber) {
                                    waveformDriverRef.current = undefined;
                                    digitizerDriverRef.current = undefined;
                                    spectrumDriverRef.current = undefined;
                                    waveformAdapterRef.current = undefined;

                                    setFFTScopeContext(undefined);
                                    setError({
                                        title: "Target Device Disconnected",
                                        description: `${deviceInfo.productName} with serial number ${deviceInfo.serialNumber} was disconnected`,
                                        details: "",
                                        solution: "Connect the target device and restart the application."
                                    });
                                }
                            }

                            deviceDisconnectedSubscription = deviceManager.deviceDisconnectedEvent.subscribeAsync(onDeviceDisconnected);
                            break;
                        }
                    }
                }
                else {
                    setFFTScopeContext(undefined);
                    setError({
                        title: "Failed to Query Peripherals on Device",
                        description: `Unable to query peripherals on ${deviceInfo.productName} with serial number ${deviceInfo.serialNumber}`,
                        details: `${peripheralQueryError}`,
                        solution: "Verify that the device is properly connected and restart the application."
                    });
                }
            }
        });

        return () => {
            console.log(`App Use Effect::Cleanup`)

            waveformDriverRef.current = undefined;
            digitizerDriverRef.current = undefined;
            spectrumDriverRef.current = undefined;
            waveformAdapterRef.current = undefined;

            setFFTScopeContext(undefined);

            deviceDisconnectedSubscription?.cancel();

            DeviceWorkQueue.post(async () => {
                await deviceManager.stopMonitoring();

                console.log(`Closing Device...`);
                device?.close();
            });
        };
    }, [seedAdapterFromVectors]);

    const onExitButtonClick = () => {
        window.close();
    }

    if ((fftScopeContext?.waveformGeneratorDriver !== undefined) || (fftScopeContext?.digitizerDriver)) {
        return (
            <div className="App">
                <FFTScopeView
                    name="FFTScope"
                    adcConfig={fftScopeContext.adcConfig}
                    waveformGeneratorDriver={fftScopeContext.waveformGeneratorDriver}
                    digitizerDriver={fftScopeContext.digitizerDriver}
                    spectrumAnalyzerDriver={fftScopeContext.spectrumAnalyzerDriver}
                    workQueue={DeviceWorkQueue}
                    spectrumViewRef={spectrumViewRef}
                    timeDomainViewRef={timeDomainViewRef}
                    frequencyVectors={frequencyVectors}
                    autoscaleEnabled={autoscaleEnabled}
                    amplitudeScaleFactor={amplitudeScaleFactor}
                    onWaveformInitialize={() => { setWaveformInitialize().catch((e) => console.error(e)); }}
                    onWaveformReset={() => { setWaveformReset().catch((e) => console.error(e)); }}
                    onAutoscaleChange={(enabled) => { setAutoscale(enabled).catch((e) => console.error(e)); }}
                    onVectorChange={onVectorChange}
                    onVectorEnabledChange={onVectorEnabledChange}
                    channelEnableStates={channelEnableStates}
                    channelColors={CHANNEL_COLORS}
                    onChannelEnableStateChange={onChannelEnableStateChange}
                    continuousEnabled={continuousEnabled}
                    onContinuousChange={setContinuousEnabled}
                    onCaptureOnce={() => { captureOnce().catch((e) => console.error(e)); }}
                    onDigitizerReset={() => {
                        setDigitizerReset()
                            .then(() => { if (!continuousEnabledRef.current) setContinuousEnabledState(true); })
                            .catch((e) => console.error(e));
                    }}
                    spectrumMode={spectrumMode}
                    onSpectrumModeChange={setSpectrumMode}
                    spectrogramNoiseFloor={spectrogramNoiseFloor}
                    onSpectrogramNoiseFloorChange={setSpectrogramNoiseFloor}
                    spectrogramGammaStops={spectrogramGammaStops}
                    onSpectrogramGammaStopsChange={setSpectrogramGammaStops}
                    spectrumOutputBuffers={spectrumOutputBuffersRef.current}
                />
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
                                        onClick={(event) => onExitButtonClick()}>Exit Application</button>
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
