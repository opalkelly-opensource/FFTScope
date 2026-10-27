/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type BinNumber = number;

export type Hertz = number;

/**
 * Binds an FFT length to the sample rate it runs at.
 */
class FFTConfiguration {
    // Fixed by the gateware.
    private readonly _FFTLength: number;

    private readonly _SampleRate: Hertz;

    public get SampleRate() {
        return this._SampleRate;
    }

    constructor(fftLength: number, sampleRate: Hertz) {
        this._FFTLength = fftLength;
        this._SampleRate = sampleRate;
    }

    public GetBinFrequency(bin: BinNumber): Hertz {
        return this._SampleRate * (bin / this._FFTLength);
    }
}

export default FFTConfiguration;
