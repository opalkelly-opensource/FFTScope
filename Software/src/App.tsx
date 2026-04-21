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

interface ErrorProperties { title: string, description: string, details: string, solution: string };

const DeviceWorkQueue = new WorkQueue();

function App() {
    const [fftScopeContext, setFFTScopeContext] = React.useState<FFTScopeContext>();
    const [error, setError] = React.useState<ErrorProperties>();

    React.useEffect(() => {
        /**
         * Loads the specified configuration file into the FPGA on the specified device.
         * @param filename - The name of the configuration file to load.
         * @param fpgaConfiguration - The fpga configuration interface to use for loading.
         */
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

        /**
         * Initializes the device by configuring the FPGA on the device with the file
         * corresponding to the product name of the device.
         * @param device - The device to initialize.
         * @returns {Promise<IDevice>} A promise that resolves to the opened device.
         */
        const initializeDevice = async (device: IDevice, topology: SafeTopology): Promise<FFTScopeContext> => {
            const deviceInfo = await device.getDeviceInfo();

            console.log(`Initializing Device Product: ${deviceInfo.productName} SerialNumber: ${deviceInfo.serialNumber}`);

            // When the ADC is absent, load the LTC2268 (adc14) bitfile by default.
            // Both bitfiles contain identical DAC logic; the choice determines
            // the FPGA clock rate the waveform generator runs at.
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

            // Single FFT configuration shared by spectrum analyzer and waveform
            // generator. Both directions agree on FFT length and sample rate;
            // amplitude references are driver/view-local (waveform generator
            // uses an IFFT_INPUT_PEAK module-local const; spectrum view reads
            // dBFS reference from adcConfiguration.fftOutputPeak via prop).
            const fftLength = 1024;
            const fftConfiguration = new FFTConfiguration(fftLength, adcConfiguration.sampleRate);

            const hasDac = topology.kind !== "adcOnly";
            const hasAdc = topology.kind !== "dacOnly";

            if(deviceInfo.interfaceType === DeviceInterfaceType.GEN3) {
                console.log("Initializing AXI driver...");

                const fpgaDataPort = await device.getFPGADataPortAXI();

                return {
                    adcConfig: adcConfiguration,
                    waveformGeneratorDriver: hasDac ? new AXIWaveformGeneratorDriver(fpgaDataPort, fftConfiguration, 100) : undefined,
                    digitizerDriver:         hasAdc ? new AXIDigitizerDriver(fpgaDataPort, 4, 1024)                       : undefined,
                    spectrumAnalyzerDriver:  hasAdc ? new AXISpectrumAnalyzerDriver(fpgaDataPort, fftConfiguration, 8)     : undefined,
                };
            }

            console.log("Initializing Classic driver...");

            const fpgaDataPort = await device.getFPGADataPortClassic();

            return {
                adcConfig: adcConfiguration,
                waveformGeneratorDriver: hasDac ? new ClassicWaveformGeneratorDriver(fpgaDataPort, fftConfiguration, 100) : undefined,
                digitizerDriver:         hasAdc ? new ClassicDigitizerDriver(fpgaDataPort, 4, 1024)                       : undefined,
                spectrumAnalyzerDriver:  hasAdc ? new ClassicSpectrumAnalyzerDriver(fpgaDataPort, fftConfiguration, 8)     : undefined,
            };
        };

        /**
         * Classifies the two raw SYZYGY_PRODUCT_MODEL strings into one of the
         * five legitimate peripheral topology outcomes. The `unsafe` variant
         * fires when a supported peripheral is on one port and any unrelated
         * non-empty peripheral is on the other — loading the FFTScope bitfile
         * drives IOs on both ports and may damage the unrelated peripheral.
         */
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
                    details: `${error}`,
                    solution: "Verify that the device is properly connected and restart the application."
                });
            }

            if(device) {
                // Step 2: Query the peripherals connected to Device Ports A and B
                let topology: PeripheralTopology | undefined;
                let peripheralQueryError: unknown;

                try {
                    const deviceSettings = await device.getDeviceSettings();

                    const dacPeripheralModel = await deviceSettings?.getValue("SYZYGY0_PRODUCT_MODEL");     // Port A
                    const adcPeripheralModel = await deviceSettings?.getValue("SYZYGY1_PRODUCT_MODEL");     // Port B

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
                            // Step 3: Initialize the Device
                            console.log(`Initializing Device '${deviceInfo.serialNumber}'...`);

                            try {
                                const drivers = await initializeDevice(device, topology);

                                // Bring drivers to ResetComplete before any view mounts.
                                await drivers.waveformGeneratorDriver?.Initialize();
                                await drivers.waveformGeneratorDriver?.Reset();
                                await drivers.digitizerDriver?.Reset();

                                setFFTScopeContext(drivers);
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

                            // Step 4: Register for Device disconnection events
                            const onDeviceDisconnected = async (sender: IDeviceManager, serialNumber: string) => {
                                console.info("Device Disconnected: " + serialNumber);
                                if(serialNumber === deviceInfo.serialNumber) {
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

    if ((fftScopeContext?.waveformGeneratorDriver !== undefined) || (fftScopeContext?.digitizerDriver)) {
        return (
            <div className="App">
                <FFTScopeView
                    name="FFTScope"
                    adcConfig={fftScopeContext.adcConfig}
                    waveformGeneratorDriver={fftScopeContext.waveformGeneratorDriver}
                    digitizerDriver={fftScopeContext.digitizerDriver}
                    spectrumAnalyzerDriver={fftScopeContext.spectrumAnalyzerDriver}
                    workQueue={DeviceWorkQueue}/>
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
