// Copyright (c) 2024-2026 Opal Kelly Incorporated
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.
//
// 2->1 AXIS mux selecting the time path (td_capbuf, widened to 64-bit) or the
// freq path (fd_capbuf) for host readback, and muxing READ_COUNT to match.
// aclk and aresetn drive no logic; they carry the IPI clock-domain association.
`default_nettype none

module readback_mux #(
    parameter integer DATA_W = 64
) (
    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 aclk CLK" *)
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF S_AXIS_TIME:S_AXIS_FREQ:M_AXIS, ASSOCIATED_RESET aresetn, FREQ_HZ 156250000" *)
    input  wire               aclk,
    (* X_INTERFACE_INFO = "xilinx.com:signal:reset:1.0 aresetn RST" *)
    (* X_INTERFACE_PARAMETER = "POLARITY ACTIVE_LOW" *)
    input  wire               aresetn,

    input  wire               path_sel,   // 0 = time, 1 = freq

    // ---- AXIS slave: TIME path (dwidth-converted td_capbuf) ----
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS_TIME TVALID" *)
    input  wire               s_time_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS_TIME TREADY" *)
    output wire               s_time_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS_TIME TDATA" *)
    input  wire [DATA_W-1:0]  s_time_axis_tdata,

    // ---- AXIS slave: FREQ path (fd_capbuf) ----
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS_FREQ TVALID" *)
    input  wire               s_freq_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS_FREQ TREADY" *)
    output wire               s_freq_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS_FREQ TDATA" *)
    input  wire [DATA_W-1:0]  s_freq_axis_tdata,

    // ---- AXIS master: to FrontPanel s_axis ----
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TVALID" *)
    output wire               m_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TREADY" *)
    input  wire               m_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TDATA" *)
    output wire [DATA_W-1:0]  m_axis_tdata,

    // ---- READ_COUNT mux to CSR ----
    input  wire [31:0]        read_count_time,
    input  wire [31:0]        read_count_freq,
    output wire [31:0]        read_count
);
    assign m_axis_tvalid = path_sel ? s_freq_axis_tvalid : s_time_axis_tvalid;
    assign m_axis_tdata  = path_sel ? s_freq_axis_tdata  : s_time_axis_tdata;

    // The unselected source is back-pressured (tready low) so it holds its frame.
    assign s_time_axis_tready = path_sel ? 1'b0 : m_axis_tready;
    assign s_freq_axis_tready = path_sel ? m_axis_tready : 1'b0;

    assign read_count = path_sel ? read_count_freq : read_count_time;
endmodule

`default_nettype wire
