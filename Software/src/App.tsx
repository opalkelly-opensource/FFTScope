/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
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
    IFPGADataPortClassic,
    WorkQueue,
    DataProgressCallback,
    ByteCount,
    IEventSubscription
} from "@opalkelly/frontpanel-platform-api";

import FrontPanel from "./FrontPanel";

import FrontPanelLogo from "../assets/images/logo512.png";

interface ErrorProperties { title: string, description: string, details: string, solution: string };

const DeviceWorkQueue = new WorkQueue();

function App() {
    const [fpgaDataPort, setFPGADataPort] = React.useState<IFPGADataPortClassic>();
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
        const initializeDevice = async (device: IDevice): Promise<void> => {
            const deviceInfo = await device.getDeviceInfo();

            console.log(`Initializing Device Product: ${deviceInfo.productName} SerialNumber: ${deviceInfo.serialNumber}`);


            const deviceSettings = await device.getDeviceSettings();

            // Determine if the SYZYGY peripheral on Port 1 is the 14bit or 12bit ADC and
            // configure the FPGA using the corresponding bitfile.
            const adcPeripheralModel = await deviceSettings?.getValue("SYZYGY1_PRODUCT_MODEL");

            let configurationFilename: string;

            if(adcPeripheralModel === "SZG-ADC-LTC2268") {
                configurationFilename = "XEM8320-AU25P/FFTScope-adc14.bit";
            }
            else if(adcPeripheralModel === "SZG-ADC-LTC2264") {
                configurationFilename = "XEM8320-AU25P/FFTScope-adc12.bit";
            }
            else {
                throw new Error(`Invalid ADC Peripheral SYZYGY1_PRODUCT_MODEL=${adcPeripheralModel}`);
            }

            const fpgaConfiguration = device.getFPGAConfiguration();

            await loadFPGAConfiguration(configurationFilename, fpgaConfiguration);
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
                device = await window.FrontPanelAPI.deviceManager.openDevice(targetDeviceSerialNumber);

                deviceInfo = await device.getDeviceInfo();

                console.log(`Opened Device Product: ${deviceInfo.productName} SerialNumber: ${deviceInfo.serialNumber}`);
            }
            catch(error) {
                console.error(`Failed to open Device ${targetDeviceSerialNumber}: \n${error}`);

                setFPGADataPort(undefined);
                setError({
                    title: "Failed to Open Target Device",
                    description: `Unable to open device with serial number ${targetDeviceSerialNumber}`,
                    details: `${error}`,
                    solution: "Verify that the device is properly connected and restart the application."
                });
            }

            if(device) {
                // Step 2: Initialize the Device
                console.log(`Initializing Device '${deviceInfo.serialNumber}'...`);

                try {
                    await initializeDevice(device);

                    const fpgaDataPort = await device.getFPGADataPortClassic();

                    setFPGADataPort(fpgaDataPort);
                }
                catch(error) {
                    console.error(`Failed to initialize Device ${deviceInfo.serialNumber}: \n${error}`);

                    setFPGADataPort(undefined);
                    setError({
                        title: "Failed to Initialize Device",
                        description: `Unable to initialize ${deviceInfo.productName} with serial number ${deviceInfo.serialNumber}`,
                        details: `${error}`,
                        solution: "Verify that the device is properly connected and restart the application."
                    });
                }

                // Step 3: Register for Device disconnection events
                const onDeviceDisconnected = async (sender: IDeviceManager, serialNumber: string) => {
                    console.info("Device Disconnected: " + serialNumber);
                    if(serialNumber === deviceInfo.serialNumber) {
                        setFPGADataPort(undefined);
                        setError({
                            title: "Target Device Disconnected",
                            description: `${deviceInfo.productName} with serial number ${deviceInfo.serialNumber} was disconnected`,
                            details: "",
                            solution: "Connect the target device and restart the application."
                        });
                    }
                }

                deviceDisconnectedSubscription = deviceManager.deviceDisconnectedEvent.subscribeAsync(onDeviceDisconnected);
            }
        });

        return () => {
            console.log(`App Use Effect::Cleanup`)

            setFPGADataPort(undefined);

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

    if (fpgaDataPort !== undefined) {
        return (
            <div className="App">
                <FrontPanel name="FFTScope" fpgaDataPort={fpgaDataPort} workQueue={DeviceWorkQueue} />
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
