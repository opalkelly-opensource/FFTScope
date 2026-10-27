/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, ReactNode } from "react";

import * as Popover from "@radix-ui/react-popover";
import * as Switch from "@radix-ui/react-switch";

import "./WaveformGeneratorView.css";

import FrequencyVectorView from "./FrequencyVectorView";

import FrequencyVectorEditView from "./FrequencyVectorEditView";

import FFTConfiguration from "./FFTConfiguration";

import { FrequencyVector, FrequencyVectorState } from "./WaveformGenerator";

interface WaveformGeneratorViewProps {
    label: string;
    fftConfiguration: FFTConfiguration;
    vectors: FrequencyVectorState[];
    isAutoScaleEnabled: boolean;
    amplitudeScaleFactor: number;
    onVectorChange: (slot: number, vector: FrequencyVector, enabled: boolean) => Promise<number>;
    onAutoScaleChange: (enabled: boolean) => Promise<number>;
    onReset: () => Promise<void>;
}

class WaveformGeneratorView extends Component<WaveformGeneratorViewProps> {
    render(): ReactNode {
        const autoscaleText: string =
            "Autoscale " + this.FormatDecibelString(this.props.amplitudeScaleFactor);
        return (
            <div className="okWaveformGenerator">
                <div className="okWaveformGeneratorControlPanel">
                    <button
                        className="okButton"
                        onMouseDown={this.OnResetButtonClick.bind(this)}
                    >
                        Reset Instrument
                    </button>
                    <div className="okSwitchContainer">
                        <Switch.Root className="okSwitchRoot" checked={this.props.isAutoScaleEnabled} onCheckedChange={this.OnUpdateAutoScaleChange.bind(this)}>
                            <Switch.Thumb className="okSwitchThumb" />
                        </Switch.Root>
                        <span className="okSwitchLabel">{autoscaleText}</span>
                    </div>
                </div>
                <div className="okWaveformGeneratorContentPanel">
                    {this.props.vectors.map((item, i) => (
                        <Popover.Root key={`FrequencyVector[${i}]`}>
                            <Popover.Trigger asChild>
                                <button className="okFrequencyVectorItem" data-state={item.isEnabled ? 'on' : 'off'}>
                                    <FrequencyVectorView
                                        frequency={this.props.fftConfiguration.GetBinFrequency(
                                            item.vector.bin
                                        )}
                                        vector={item.vector}
                                    />
                                </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                                <Popover.Content side="right" sideOffset={15}>
                                    <FrequencyVectorEditView
                                        id={i}
                                        frequency={this.props.fftConfiguration.GetBinFrequency(
                                            item.vector.bin
                                        )}
                                        vector={item.vector}
                                        onVectorChange={this.OnFrequencyVectorChange.bind(this)}
                                        enabled={item.isEnabled}
                                        onEnabledChange={this.OnFrequencyVectorIsEnabledChange.bind(this)}
                                    />
                                </Popover.Content>
                            </Popover.Portal>
                        </Popover.Root>
                    ))}
                </div>
            </div>
        );
    }

    /**
     * Formats the string representation of a decibel value.
     * @param value - Decibel value to format.
     * @returns String representation of the decibel value.
     */
    private FormatDecibelString(value: number): string {
        const decibelValue: number = 20.0 * Math.log10(value);

        return decibelValue.toPrecision(3) + " dB";
    }

    /** Event handler for the Reset Instrument button. */
    private OnResetButtonClick(): void {
        this.props.onReset().catch((error) => {
            console.error("WaveformGenerator reset failed:", error);
        });
    }

    /**
     * Event handler that updates a Frequency Vector with a new Frequency Vector.
     * @param vectorId - Identifier of the Frequency Vector to update.
     * @param vector - New Frequency Vector to update the existing Frequency Vector.
     */
    private OnFrequencyVectorChange(vectorId: number, vector: FrequencyVector): void {
        const slot = this.props.vectors[vectorId];
        if (slot === undefined) return;
        this.props.onVectorChange(vectorId, vector, slot.isEnabled).catch((error) => {
            console.error("WaveformGenerator vector change failed:", error);
        });
    }

    /**
     * Event handler that updates the isEnabled state of a Frequency Vector.
     * @param vectorId - Identifier of the Frequency Vector to update.
     * @param enabled - New state of the isEnabled flag.
     */
    private OnFrequencyVectorIsEnabledChange(vectorId: number, enabled: boolean): void {
        const slot = this.props.vectors[vectorId];
        if (slot === undefined) return;
        this.props.onVectorChange(vectorId, slot.vector, enabled).catch((error) => {
            console.error("WaveformGenerator enable change failed:", error);
        });
    }

    /**
     * Event handler that is called when the AutoScale state changes.
     * @param checked - New state of the AutoScale switch.
     */
    private OnUpdateAutoScaleChange(checked: boolean): void {
        this.props.onAutoScaleChange(checked).catch((error) => {
            console.error("WaveformGenerator autoscale change failed:", error);
        });
    }
}

export default WaveformGeneratorView;
