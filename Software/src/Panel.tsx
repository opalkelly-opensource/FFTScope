/**
 * Copyright (c) 2024-2026 Opal Kelly Incorporated
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { Component, ReactNode } from "react";

import classnames from "classnames";

import "./Panel.css";

interface PanelProps extends React.PropsWithChildren<NonNullable<unknown>> {
    title: string;
    className?: string;
    disabled: boolean;
    headerRight?: ReactNode;
}

class Panel extends Component<PanelProps> {
    render() {
        return (
            <div className={classnames("okPanel", this.props.className, {
                    "disabled": this.props.disabled
                })}>
                <div className="okPanelHeader">
                    <span className="okPanelTitleText">{this.props.title}</span>
                    {this.props.headerRight != null && (
                        <div className="okPanelHeaderRight">{this.props.headerRight}</div>
                    )}
                </div>
                <div className="okPanelContent">{this.props.children}</div>
            </div>
        );
    }
}

export default Panel;
