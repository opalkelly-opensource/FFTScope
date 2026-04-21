/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export enum DACProductType {
    SZG_DAC_AD9116 = "SZG-DAC-AD9116"
}

const KNOWN_AD9116_NAMES = [
    "SZG-DAC-AD9116",
    "POD-DAC-AD9116"
];

export const ProductModelToDACType = (modelName: string | undefined): DACProductType | undefined => {
    return KNOWN_AD9116_NAMES.includes(modelName ?? "")
        ? DACProductType.SZG_DAC_AD9116
        : undefined;
};
