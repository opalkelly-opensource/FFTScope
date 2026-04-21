/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Hertz } from "./FFTConfiguration";

export enum ADCProductType {
    SZG_ADC_LTC2268 = "SZG-ADC-LTC2268",
    SZG_ADC_LTC2264 = "SZG-ADC-LTC2264"
}

/**
 * Per-variant ADC configuration consumed by the views and FFT plumbing.
 * Composed at device init time from chip-intrinsic data (ADCChipTable)
 * and the bitfile's operating rate (BitfileTable). The rest of the data
 * path is variant-agnostic (the gateware emits signed Int16 samples and
 * Int32 FFT bins on the wire regardless of the underlying ADC width).
 */
export interface ADCProductConfig {
    sampleRate: Hertz,
    /**
     * Native bit width of the ADC sample. The gateware sign-extends each
     * sample to a 16-bit signed value before placing it on the wire, so
     * the host always reads Int16, but the meaningful value range is
     * still bounded by this width: signed range is -(2^(N-1)) to
     * 2^(N-1) - 1. Drives the time-domain chart Y-axis bounds.
     */
    adcBitWidth: number,
    /**
     * FFT output magnitude for a full-scale sine input. Used as the dBFS
     * reference in the spectrum display. Determined by the HLS output
     * type of the variant's FFT core:
     *   ap_fixed<24,11>: peak = N/2 * 2^13 = 4,194,304 = 0x400000
     *   ap_fixed<22,11>: peak = N/2 * 2^11 = 1,048,576 = 0x100000
     * (N = 1024 for the 1024-point FFT used in this design.)
     */
    fftOutputPeak: number
}

/**
 * Chip-intrinsic ADC properties — identical regardless of which board
 * the peripheral is plugged into.
 */
export interface ADCChipSpec {
    adcBitWidth: number,
    fftOutputPeak: number
}

export const ADCChipTable: Record<ADCProductType, ADCChipSpec> = {
    [ADCProductType.SZG_ADC_LTC2268]: {
        adcBitWidth: 14,
        fftOutputPeak: 0x400000   // ap_fixed<24,11>: N/2 * 2^13
    },
    [ADCProductType.SZG_ADC_LTC2264]: {
        adcBitWidth: 12,
        fftOutputPeak: 0x100000   // ap_fixed<22,11>: N/2 * 2^11
    }
};

/**
 * Identifies a shipped FFTScope bitfile and the sample rate at which it
 * clocks the ADC. Path is relative to the assets/bitfiles/ root.
 */
export interface BitfileSpec {
    path: string,
    sampleRate: Hertz
}

// Operating sample rate of the shipped bitfile. May fall below the
// chip's datasheet maximum on combinations whose LVDS line rate exceeds
// what FPGA static timing analysis (STA) can close; the chip and the
// board's LVDS routing both support higher rates, but this design
// ships STA-only bitfiles. Reaching the chip's full rate requires
// dynamic phase alignment (DPA, per XAPP524) and is left to customers
// who need it. Update sampleRate when replacing an STA bitfile with a
// DPA build.
export const BitfileTable: Record<string, Record<ADCProductType, BitfileSpec>> = {
    "XEM8320-AU25P": {
        [ADCProductType.SZG_ADC_LTC2268]: { path: "XEM8320-AU25P/FFTScope-adc14.bit",     sampleRate: 125000000 },
        [ADCProductType.SZG_ADC_LTC2264]: { path: "XEM8320-AU25P/FFTScope-adc12.bit",     sampleRate:  40000000 }
    },
    "SZG-HUB1450-AU10P": {
        [ADCProductType.SZG_ADC_LTC2268]: { path: "SZG-HUB1450-AU10P/FFTScope-adc14.bit", sampleRate:  80000000 },
        [ADCProductType.SZG_ADC_LTC2264]: { path: "SZG-HUB1450-AU10P/FFTScope-adc12.bit", sampleRate:  40000000 }
    }
};

export const ProductModelToADCType = (modelName: string | undefined): ADCProductType | undefined => {
    let retval: ADCProductType | undefined;

    if (modelName === ADCProductType.SZG_ADC_LTC2268 || modelName === ADCProductType.SZG_ADC_LTC2264) {
        retval = modelName as ADCProductType;
    }
    else {
        retval = undefined;     //ERROR: Unexpected Product Model Name
    }

    return retval;
};
