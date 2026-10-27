/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import "./ToggleComponent.css";

import * as Toggle from "@radix-ui/react-toggle";

export type ToggleStateChangeHandler = (pressed: boolean) => void;

export interface ToggleComponentProps {
    label: string;
    color: string;
    toggleState: boolean;
    onToggleStateChange: ToggleStateChangeHandler;
}

function ToggleComponent(props: ToggleComponentProps) {
    return (
        <div className="okToggleComponent">
            <Toggle.Root
                className="okToggleRoot"
                pressed={props.toggleState}
                onPressedChange={props.onToggleStateChange}
                style={{
                    borderColor: props.color,
                    backgroundColor: props.toggleState ? props.color : 'black'
                }}
            />
            <span className="okChannelLabelText">
                {props.label}
            </span>
        </div>
    );
}

export default ToggleComponent;
