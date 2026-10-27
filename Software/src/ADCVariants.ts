/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Table of compatible SYZYGY ADC variants, with corresponding bitstream
 * and encode rate.
 */

import { Hertz } from "./FFTConfiguration";

export enum ADCProductType {
    SZG_ADC_LTC2268 = "SZG-ADC-LTC2268", // 14-bit, 125 MSPS
    SZG_ADC_LTC2264 = "SZG-ADC-LTC2264" //  12-bit,  40 MSPS
}

export interface ADCVariantSpec {
    productType: ADCProductType;
    bitfileName: string;
    sampleRate: Hertz;
}

export const ADCVariantTable: Record<ADCProductType, ADCVariantSpec> = {
    [ADCProductType.SZG_ADC_LTC2268]: {
        productType: ADCProductType.SZG_ADC_LTC2268,
        bitfileName: "fftscope_14.bit",
        sampleRate: 125_000_000
    },
    [ADCProductType.SZG_ADC_LTC2264]: {
        productType: ADCProductType.SZG_ADC_LTC2264,
        bitfileName: "fftscope_12.bit",
        sampleRate: 40_000_000
    }
};

/**
 * Fallback variant used only to pick a bitstream for DAC-only bring-up.
 */
export const DEFAULT_ADC_VARIANT: ADCVariantSpec = ADCVariantTable[ADCProductType.SZG_ADC_LTC2268];

/**
 * Map a SmartVIO product-model string to its ADC variant, or undefined when
 * the connected peripheral is not supported.
 * @param modelName - Reported product-model string, or undefined if none.
 */
export const resolveADCVariant = (modelName: string | undefined): ADCVariantSpec | undefined => {
    if (modelName === undefined) {
        return undefined;
    }

    return ADCVariantTable[modelName as ADCProductType];
};
