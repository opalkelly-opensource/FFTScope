/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { DACDriver, FrequencyBin } from "./DACDriver";

import { BinNumber } from "./FFTConfiguration";

export type dBFS = number;

export type FrequencyVector = {
    bin: BinNumber;
    amplitude: dBFS;
};

export type FrequencyVectorState = {
    vector: FrequencyVector;
    isEnabled: boolean;
};

export type BinMapEntry = {
    bin: BinNumber;
    amplitude: number;
};

export class WaveformGenerator {
    private readonly _Driver: DACDriver;

    private readonly _FrequencyBinMap: Map<BinNumber, FrequencyBin> = new Map<
        BinNumber,
        FrequencyBin
    >();

    private _AmplitudeScaleFactor = 1.0;

    public get AmplitudeScaleFactor() {
        return this._AmplitudeScaleFactor;
    }

    constructor(driver: DACDriver) {
        this._Driver = driver;
    }

    /** Clears every bin and re-enables the DAC playout path. */
    public async Reset(): Promise<void> {
        await this._Driver.EnablePlayback();

        this._FrequencyBinMap.clear();
        this._AmplitudeScaleFactor = 1.0;
    }

    /**
     * Replaces the generated spectrum with exactly the specified vectors:
     * rebuilds the frequency-bin map, computes the autoscale factor, and
     * restages the hardware spectrum.
     * @param vectors - The complete set of enabled frequency vectors.
     * @param autoscale - If true, scale so the summed amplitude never exceeds 1.0.
     * @returns The applied amplitude scale factor.
     */
    public async SetVectors(vectors: FrequencyVector[], autoscale: boolean): Promise<number> {
        this._FrequencyBinMap.clear();

        for (const vector of vectors) {
            const amplitude = WaveformGenerator.GetAmplitudeValue(vector.amplitude);
            const existing = this._FrequencyBinMap.get(vector.bin);

            if (existing === undefined) {
                this._FrequencyBinMap.set(vector.bin, {
                    number: vector.bin,
                    amplitude: amplitude
                });
            } else {
                // A bin holds one complex value per component; same-bin vectors sum.
                existing.amplitude += amplitude;
            }
        }

        this._AmplitudeScaleFactor = autoscale ? this.ComputeAmplitudeScaleFactor() : 1.0;

        const monoBins = Array.from(this._FrequencyBinMap.values());
        await this._Driver.SetSpectrumDual(
            monoBins,
            this._AmplitudeScaleFactor,
            monoBins,
            this._AmplitudeScaleFactor
        );

        return this._AmplitudeScaleFactor;
    }

    /** Bin number and summed linear amplitude for every staged bin. */
    public GetBinMap(): BinMapEntry[] {
        const entries: BinMapEntry[] = [];
        for (const entry of this._FrequencyBinMap.values()) {
            entries.push({ bin: entry.number, amplitude: entry.amplitude });
        }
        return entries;
    }

    /** Scales the summed linear amplitude down to 1.0 when it would exceed it. */
    private ComputeAmplitudeScaleFactor(): number {
        let peakSum = 0;
        this._FrequencyBinMap.forEach((value) => {
            peakSum += value.amplitude;
        });

        return peakSum > 1.0 ? 1.0 / peakSum : 1.0;
    }

    private static GetAmplitudeValue(value: dBFS): number {
        if (value === 0) {
            return 1.0;
        } else {
            return Math.pow(10, value / 20);
        }
    }
}
