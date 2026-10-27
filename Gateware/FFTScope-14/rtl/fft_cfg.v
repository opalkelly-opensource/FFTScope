// Copyright (c) 2024-2026 Opal Kelly Incorporated
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.
//
// Fixed configuration driver for a stock xfft S_AXIS_CONFIG channel. The core
// latches direction and the per-stage scaling schedule once per frame and drops
// TREADY in between, so a constant word held valid is enough.
//
// W must equal the configured core's S_AXIS_CONFIG TDATA width, and VAL is that
// core's config word.
`default_nettype none

module fft_cfg #(
    parameter integer        W   = 8,
    parameter [W-1:0]        VAL = 8'h00
) (
    // aclk drives no logic. It binds M_AXIS_CONFIG and aresetn to the 156.25 MHz
    // system clock; without the association the config interface defaults to
    // 100 MHz and validate_bd_design fails with BD 41-237 against xfft (156250000).
    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 aclk CLK" *)
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF M_AXIS_CONFIG, ASSOCIATED_RESET aresetn, FREQ_HZ 156250000" *)
    input  wire          aclk,
    (* X_INTERFACE_INFO = "xilinx.com:signal:reset:1.0 aresetn RST" *)
    (* X_INTERFACE_PARAMETER = "POLARITY ACTIVE_LOW" *)
    input  wire          aresetn,

    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS_CONFIG TDATA" *)
    output wire [W-1:0]  m_axis_config_tdata,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS_CONFIG TVALID" *)
    output wire          m_axis_config_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS_CONFIG TREADY" *)
    input  wire          m_axis_config_tready
);
    assign m_axis_config_tdata  = VAL;
    assign m_axis_config_tvalid = aresetn;

endmodule

`default_nettype wire
