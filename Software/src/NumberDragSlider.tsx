/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useRef, useCallback } from "react";

import "./NumberDragSlider.css";

import { Vector2D } from "./Vector";

/**
 * Event handler for handling when the value is changed.
 */
export type ValueChangeEventHandler = (value: number) => void;

/**
 * Properties for the NumberEditBox Component.
 */
export interface NumberDragSliderProps {
    label: string;
    maximum: number;
    minimum: number;
    stepsPerPixel: { coarse: number, fine: number }
    value: number;
    onValueChange: ValueChangeEventHandler;
}

function NumberDragSlider(props: NumberDragSliderProps) {
    const [isSliderDragging, setIsSliderDragging] = useState(false);

    const startSliderPositionRef = useRef<Vector2D>({ x: 0, y: 0 });
    const startSliderValueRef = useRef(0);
    const dragSliderRef = useRef<HTMLDivElement>(null);

    /**
     * Handle mouse down on units label text to start dragging
     */
    const handleSliderMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsSliderDragging(true);

        startSliderPositionRef.current = { x: e.clientX, y: e.clientY };
        startSliderValueRef.current = props.value;

        // Change cursor to indicate dragging
        document.body.style.cursor = 'move';
    }, [props.value]);

    /**
     * Handle mouse move during dragging
     */
    const handleSliderMouseMove = useCallback((e: MouseEvent) => {
        if (!isSliderDragging) return;

        const deltaX = e.clientX - startSliderPositionRef.current.x;
        const coarseSensitivity = props.stepsPerPixel.coarse;
        const coarseSteps = Math.trunc(deltaX * coarseSensitivity);

        const deltaY = e.clientY - startSliderPositionRef.current.y;
        const fineSensitivity = props.stepsPerPixel.fine;
        const fineSteps = -Math.trunc(deltaY * fineSensitivity);

        const valueChange = fineSteps + coarseSteps;
        const newValue = Math.max(props.minimum, Math.min(props.maximum, startSliderValueRef.current + valueChange));

        if (newValue !== props.value) {
            props.onValueChange(newValue);
        }
    }, [isSliderDragging, props.value, props.stepsPerPixel]);

    /**
     * Handle mouse up to stop dragging
     */
    const handleSliderMouseUp = useCallback(() => {
        setIsSliderDragging(false);
        document.body.style.cursor = 'default';
    }, []);

    // Add/remove event listeners for mouse move and up
    React.useEffect(() => {
        if (isSliderDragging) {
            document.addEventListener('mousemove', handleSliderMouseMove);
            document.addEventListener('mouseup', handleSliderMouseUp);

            return () => {
                document.removeEventListener('mousemove', handleSliderMouseMove);
                document.removeEventListener('mouseup', handleSliderMouseUp);
            };
        }
    }, [isSliderDragging, handleSliderMouseMove, handleSliderMouseUp]);

    return (
        <span
            className="okNumberDragSliderLabel"
            onMouseDown={handleSliderMouseDown}
            style={{ 
                cursor: isSliderDragging ? 'move' : 'move',
                userSelect: 'none',
                WebkitUserSelect: 'none'
            }}
            ref={dragSliderRef}>
            {props.label}
        </span>
    );
}

export default NumberDragSlider;
