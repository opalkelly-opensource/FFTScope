/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { IFPGADataPortClassic, ByteCount } from "@opalkelly/frontpanel-platform-api";

import { DigitizerDriver, DigitizerState } from "./DigitizerDriver";

// FrontPanel endpoints owned by digitizer on the gateware side
// (Phase 4 — each subblock owns its own endpoints; nothing shared).
//
//   PipeOut  0xa0:  ADC sample pairs
//   WireIn   0x01:  [0] RESET
//   TriggerIn 0x42: [0] FILL_FIFO
//   WireOut  0x21:  [0] CLOCK_LOCKED, [1] ADC_FIFO_PROG_FULL
const PIPE_OUT_ADC_SAMPLES = 0xa0;

const WIRE_IN_CONTROL = {
    address: 0x01,
    RESET: 0x01,                // [0] R/W - hold ADC FIFO in reset
} as const;

const TRIG_IN_CTRL = {
    address: 0x42,
    FILL_FIFO: 0,               // bit 0 (passed to activateTriggerIn as a bit INDEX, not a mask)
} as const;

const WIRE_OUT_STATUS = {
    address: 0x21,
    CLOCK_LOCKED:       0x01,   // [0] RO - PLL clock locked
    ADC_FIFO_PROG_FULL: 0x02,   // [1] RO - capture FIFO has enough samples
} as const;

/**
 * Class representing a Digitizer.
 */
export class ClassicDigitizerDriver extends DigitizerDriver {
    private readonly _FPGADataPort: IFPGADataPortClassic;

    /**
     * Create a new instance of the Digitizer.
     * @param fpgaDataPort - Object that implements the IFPGADataPortClassic interface used to communicate with device.
     * @param sampleSize - Size of each sample in bytes.
     * @param sampleCount - Number of samples to read from the ADC.
     */
    constructor(fpgaDataPort: IFPGADataPortClassic, sampleSize: ByteCount, sampleCount: number) {
        super(sampleSize, sampleCount);

        this._FPGADataPort = fpgaDataPort;
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

            // Wait for Clocks to Lock
            await this._FPGADataPort.updateWireOuts();

            let isLocked: boolean = ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.CLOCK_LOCKED) === WIRE_OUT_STATUS.CLOCK_LOCKED;

            for (let retryIndex = 1; retryIndex < 100 && !isLocked; retryIndex++) {
                await this._FPGADataPort.updateWireOuts();

                isLocked = ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.CLOCK_LOCKED) === WIRE_OUT_STATUS.CLOCK_LOCKED;
            }

            if (isLocked) {
                this._FPGADataPort.setWireInValue(WIRE_IN_CONTROL.address, WIRE_IN_CONTROL.RESET, 0xffffffff);
                await this._FPGADataPort.updateWireIns();
                this._FPGADataPort.setWireInValue(WIRE_IN_CONTROL.address, 0x00000000, 0xffffffff);
                await this._FPGADataPort.updateWireIns();

                this.UpdateState(DigitizerState.ResetComplete);

                console.log("Digitizer::Reset Complete.");
            } else {
                this.UpdateState(DigitizerState.ResetFailed);

                console.log("Digitizer::Reset Failed.");
            }

            retval = isLocked;
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
            await this._FPGADataPort.activateTriggerIn(TRIG_IN_CTRL.address, TRIG_IN_CTRL.FILL_FIFO); // Fill the ADC FIFO

            // Wait for FIFO to fill.
            await this._FPGADataPort.updateWireOuts();

            let isFull: boolean =
                ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.ADC_FIFO_PROG_FULL) === WIRE_OUT_STATUS.ADC_FIFO_PROG_FULL;

            while (!isFull) {
                await this._FPGADataPort.updateWireOuts();

                isFull =
                    ((this._FPGADataPort.getWireOutValue(WIRE_OUT_STATUS.address)) & WIRE_OUT_STATUS.ADC_FIFO_PROG_FULL) === WIRE_OUT_STATUS.ADC_FIFO_PROG_FULL;
            }

            //  Read Data
            const sampleData: ArrayBuffer = new ArrayBuffer(this.SampleSize * this.SampleCount);

            await this._FPGADataPort.readFromPipeOut(
                PIPE_OUT_ADC_SAMPLES,
                sampleData
            );

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
