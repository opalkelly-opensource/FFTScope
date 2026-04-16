/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as Switch from "@radix-ui/react-switch"
import * as RadioGroup from "@radix-ui/react-radio-group"

import { Hertz } from "./FFTConfiguration";

import { FrequencyVector, dBFS } from "./FFTSignalGeneratorAdapter";

import "./FrequencyVectorEditView.css";

import NumberDragSlider from "./NumberDragSlider";

import SinWaveformIcon from "./SineWaveformIcon";

/**
 * Event handler for handling changes in the frequency vector.
 */
export type FrequencyVectorChangeEventHandler = (vectorId: number, vector: FrequencyVector) => void;
export type FrequencyVectorEnabledChangeEventHandler = (vectorId: number, enabled: boolean) => void;

/**
 * Properties for the Frequency Vector Component.
 */
interface FrequencyVectorEditViewProps {
    id: number;
    frequency: Hertz;
    vector: FrequencyVector;
    onVectorChange: FrequencyVectorChangeEventHandler;
    enabled: boolean;
    onEnabledChange: FrequencyVectorEnabledChangeEventHandler;
}

function FrequencyVectorEditView(props: FrequencyVectorEditViewProps) {
    /**
     * Event handler for changes in the bin number slider.
     * @param value - The new value of the bin number slider.
     */
    const onBinNumberSliderChange = (value: number) => {
        props.onVectorChange(props.id, {
            bin: value,
            amplitude: props.vector.amplitude
        });
    }

    /**
     * Event handler for changes in the amplitude value.
     * @param value - The new value of the amplitude.
     */
    const onAmplitudeSliderChange = (value: number) => {
        const targetAmplitude: dBFS = value;

        props.onVectorChange(props.id, {
            bin: props.vector.bin,
            amplitude: targetAmplitude
        });
    }

    /**
     * Event handler for changes in the enabled state.
     * @param checked - The new enabled state.
     */
    const onEnabledChange = (checked: boolean) => {
        props.onEnabledChange(props.id, checked);
    }


    const formatFrequencyValue = (frequency: Hertz) => {
        const frequencyKiloHertz = (frequency / 1000);

        return frequencyKiloHertz.toFixed(3);
    }

    return (
        <div className="okFrequencyVectorEditPanel">
            <div className="okFrequencyVectorEditRow">
                <div style={{ display: "flex", alignItems: "center", padding: "4px" }}>
                    <Switch.Root className="okSwitchRoot" checked={props.enabled} onCheckedChange={onEnabledChange}>
                        <Switch.Thumb className="okSwitchThumb" />
                    </Switch.Root>
                </div>
                <div className="okFrequencyEditBox">
                    <span className="okFrequencyText">
                        {formatFrequencyValue(props.frequency)}
                    </span>
                    <NumberDragSlider
                        label="kHz"
                        minimum={0}
                        maximum={512}
                        stepsPerPixel={{coarse: 1.0, fine: 0.125}}      //Coarse: 1 pixel per step, Fine: 8 pixels per step
                        value={props.vector.bin}
                        onValueChange={onBinNumberSliderChange}
                    />
                </div>
            </div>
            <div className="okFrequencyVectorEditRow">
                <RadioGroup.Root className="okRadioGroupRoot" defaultValue="sine">
                    <RadioGroup.Item
                        className="okRadioGroupItem"
                        value="sine"
                        aria-label="Left aligned"
                        >
                            <SinWaveformIcon/>
                    </RadioGroup.Item>
                </RadioGroup.Root>
                <div className="okAmplitudeEditBox">
                    <span className="okAmplitudeText">{props.vector.amplitude}</span>
                    <NumberDragSlider
                        label="dBFS"
                        minimum={-120}
                        maximum={0}
                        stepsPerPixel={{coarse: 0.25, fine: 0.065}}      //Coarse: 4 pixel per step, Fine: 16 pixels per step
                        value={props.vector.amplitude}
                        onValueChange={onAmplitudeSliderChange}
                    />
                </div>
            </div>
        </div>
    );
}


export default FrequencyVectorEditView;
