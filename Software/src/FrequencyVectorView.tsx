/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Hertz } from "./FFTConfiguration";

import { FrequencyVector } from "./WaveformGenerator";

import "./FrequencyVectorView.css";

import SinWaveformIcon from "./SineWaveformIcon";

export interface FrequencyVectorViewProps {
    frequency: Hertz;
    vector: FrequencyVector;
}

function FrequencyVectorView(props: FrequencyVectorViewProps) {
    const { frequency, vector } = props;

    const formatFrequencyValue = (frequency: Hertz) => {
        const frequencyKiloHertz = (frequency / 1000);

        return frequencyKiloHertz.toFixed(3);
    }

    return (
        <div className="okFrequencyVectorPanel">
            <div className="okFrequencyBox">
                <span className="okFrequencyText">{formatFrequencyValue(frequency)}</span>
                <span className="okUnitsLabel">kHz</span>
            </div>
            <div className="okFrequencyVectorRow">
                <div className="okWaveformIndicator">
                    <SinWaveformIcon />
                </div>
                <div className="okAmplitudeBox">
                    <span className="okAmplitudeText">{vector.amplitude}</span>
                    <span className="okUnitsLabel">dBFS</span>
                </div>
            </div>
        </div>
    );
}

export default FrequencyVectorView;
