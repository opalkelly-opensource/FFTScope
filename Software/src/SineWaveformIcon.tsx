/**
 * Copyright (c) 2024-2025 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as React from "react";

export interface SineWaveformIconProps extends React.SVGAttributes<SVGElement> {
    children?: never;
    color?: string;
}

export const SinWaveformIcon = React.forwardRef<SVGSVGElement, SineWaveformIconProps>(
    function SinWaveformIcon(
        { color = "currentColor", ...props },
        forwardedRef,
    ) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <g clip-path="url(#clip0_7250_4844)">
                <path d="M1 9.00006L1.27103 6.83183C1.63919 3.88652 5.60371 3.20743 6.93114 5.86229L9.06887 10.1377C10.3963 12.7926 14.3608 12.1135 14.729 9.1682L15 7.00006" stroke="#989DA3" stroke-linecap="round" stroke-linejoin="round"/>
            </g>
            <defs>
                <clipPath id="clip0_7250_4844">
                <rect width="16" height="16" fill="white"/>
                </clipPath>
            </defs>
            </svg>
        );
    },
);

export default SinWaveformIcon;
