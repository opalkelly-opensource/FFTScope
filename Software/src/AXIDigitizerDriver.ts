/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { IFPGADataPortAXI, ByteCount } from "@opalkelly/frontpanel-platform-api";

import { AXIStreamSwitch } from "./AXIStreamSwitch";

import { DigitizerDriver, DigitizerState } from "./DigitizerDriver";

// CSR register map for digitizer_csr.v on the digitizer slave
// (address space 0x0000_1000 - 0x0000_1fff).
//
//  0x0000_1000 CONTROL     [0]  R/W  Reset
//  0x0000_1040 TRIG_CTRL   [0]  WO   fill_fifo
//  0x0000_1060 STATUS      [0]  RO   adc_fifo_prog_full

const CONTROL = {
    address: 0x00001000,
    RESET: 0x01,                // [0] R/W - hold ADC FIFO in reset
} as const;

const TRIG_CTRL = {
    address: 0x00001040,
    FILL_FIFO: 0x01,            // [0] WO - start a capture into the ADC FIFO
} as const;

const STATUS = {
    address: 0x00001060,
    ADC_FIFO_PROG_FULL: 0x01,   // [0] RO - capture FIFO has enough samples
} as const;

const STREAM_SWITCH_BASE = 0x44a00000;
const STREAM_SLOT_ADC_OUT = 0;

/**
 * Class representing a Digitizer.
 */
export class AXIDigitizerDriver extends DigitizerDriver {
    private readonly _FPGADataPort: IFPGADataPortAXI;

    private readonly _TimeoutMilliseconds = 5000;

    private readonly _StreamSwitch: AXIStreamSwitch;

    /**
     * Create a new instance of the Digitizer.
     * @param fpgaDataPort - Object that implements the IFPGADataPortAXI interface used to communicate with device.
     * @param sampleSize - Size of each sample in bytes.
     * @param sampleCount - Number of samples to read from the ADC.
     */
    constructor(fpgaDataPort: IFPGADataPortAXI, sampleSize: ByteCount, sampleCount: number) {
        super(sampleSize, sampleCount);

        this._FPGADataPort = fpgaDataPort;

        this._StreamSwitch = new AXIStreamSwitch(fpgaDataPort, STREAM_SWITCH_BASE);
    }

    /**
     * Performs reset of the Digitizer.
     * @returns Promise that resolves to true when the reset is successful, otherwise false.
     */
    public async Reset(): Promise<boolean> {
        let retval: boolean;

        if (
            this.State === DigitizerState.InitializationComplete ||
            this.State === DigitizerState.ResetComplete ||
            this.State === DigitizerState.ResetFailed
        ) {
            console.log("Digitizer::Reset Pending...");

            this.UpdateState(DigitizerState.ResetPending);

            try {
                // Assert Reset bit [0]
                await this._FPGADataPort.axiLite.write(CONTROL.address, CONTROL.RESET, this._TimeoutMilliseconds);

                // Deassert Reset bit [0]
                await this._FPGADataPort.axiLite.write(CONTROL.address, 0x00, this._TimeoutMilliseconds);

                this.UpdateState(DigitizerState.ResetComplete);
                retval = true;
            }
            catch(error) {
                console.error(`Failed to reset Digitizer: \n${error}`);
                this.UpdateState(DigitizerState.ResetFailed);
                retval = false;     // ERROR: Failed to Reset
            }
        } else {
            retval = false; // ERROR: Invalid State
        }

        return retval;
    }

    /**
     * Reads samples from ADC for two channels.
     * @param channels - Array of at least two Int16Arrays used to store the samples for each of the two channels.
     * @returns Promise that resolves to true when the samples are read successfully, otherwise false.
     */
    public async ReadSamples(channels: Int16Array[]): Promise<boolean> {
        let retval: boolean;

        if (this.State === DigitizerState.ResetComplete) {

            // Set the Stream Switch to read ADC data
            await this._StreamSwitch.UpdateSlaveIndex(STREAM_SLOT_ADC_OUT);

            // Trigger the FIFO to Fill
            await this._FPGADataPort.axiLite.write(TRIG_CTRL.address, TRIG_CTRL.FILL_FIFO, this._TimeoutMilliseconds);

            // Wait for the FIFO to Fill
            let status = await this._FPGADataPort.axiLite.read(STATUS.address, this._TimeoutMilliseconds);
            let isFifoFull: boolean = (status & STATUS.ADC_FIFO_PROG_FULL) == STATUS.ADC_FIFO_PROG_FULL;

            for (let retryIndex = 1; retryIndex < 100 && !isFifoFull; retryIndex++) {
                status = await this._FPGADataPort.axiLite.read(STATUS.address, this._TimeoutMilliseconds);
                isFifoFull = (status & STATUS.ADC_FIFO_PROG_FULL) == STATUS.ADC_FIFO_PROG_FULL;
            }

            // Read Data from FIFO
            const sampleData: ArrayBuffer = new ArrayBuffer(this.SampleSize * this.SampleCount);

            await this._FPGADataPort.axiStream.read(sampleData, this._TimeoutMilliseconds);

            const samples: DataView = new DataView(sampleData);

            for (let sampleIndex = 0; sampleIndex < this.SampleCount; sampleIndex++) {
                const byteOffset: ByteCount = sampleIndex * this.SampleSize;

                channels[0][sampleIndex] = samples.getInt16(byteOffset, true);
                channels[1][sampleIndex] = samples.getInt16(byteOffset + 2, true);
            }

            retval = true; // SUCCESS:
        } else {
            retval = false; // ERROR: Invalid State
        }

        return retval;
    }
}
