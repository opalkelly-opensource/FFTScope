/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const LUT_SIZE = 256;

/**
 * Magma colormap — 256-entry RGB lookup table (Uint8), laid out as R,G,B,R,G,B,...
 * Built from a 7th-order polynomial approximation of matplotlib's magma at module load.
 * Polynomial coefficients: https://observablehq.com/@flimsyhat/webgl-color-maps
 */
export const MagmaLUT: Uint8Array = (function buildMagmaLUT(): Uint8Array {
    const lut = new Uint8Array(LUT_SIZE * 3);

    const c0 = [-0.002136485053939582, -0.000749655052010527, -0.005386127855323933];
    const c1 = [ 0.251660540737164200,  0.677523243683766800,  2.494026599312351000];
    const c2 = [ 8.353717279216625000, -3.577719514958484000,  0.314467903013257300];
    const c3 = [-27.66873308576866000, 14.264730780965330000, -13.64921318813922000];
    const c4 = [ 52.17613981234068000, -27.94360607168351000,  12.94416944693896000];
    const c5 = [-57.28219111215227000,  26.98345500614822000,   4.234152102981725000];
    const c6 = [ 34.20103749391743000, -13.32669976504099000, -15.63115744495116000];
    const c7 = [-8.551707373617554000,   2.904598841819851000,   4.905463393289598000];

    for (let i = 0; i < LUT_SIZE; i++) {
        const t = i / (LUT_SIZE - 1);
        const r = c0[0] + t * (c1[0] + t * (c2[0] + t * (c3[0] + t * (c4[0] + t * (c5[0] + t * (c6[0] + t * c7[0]))))));
        const g = c0[1] + t * (c1[1] + t * (c2[1] + t * (c3[1] + t * (c4[1] + t * (c5[1] + t * (c6[1] + t * c7[1]))))));
        const b = c0[2] + t * (c1[2] + t * (c2[2] + t * (c3[2] + t * (c4[2] + t * (c5[2] + t * (c6[2] + t * c7[2]))))));
        lut[i * 3 + 0] = Math.max(0, Math.min(255, Math.round(r * 255)));
        lut[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
        lut[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    }

    return lut;
})();

export const MagmaLUTSize = LUT_SIZE;
