`timescale 1ns / 1ps
//------------------------------------------------------------------------
// spectrum_analyzer.v
//
// Top-level wrapper for the spectrum analyzer datapath. Combines the
// spectrum_analyzer_csr (AXI-Lite slave), the fft_controller (TX/RX
// FIFOs + state machine + AXI Stream), and the HLS rfft IP core.
//
// Phase 5: the CSR lives at the wrapper top level, mirroring the
// digitizer.v pattern. Control wires (reset, start) come out of the
// CSR and feed into fft_controller; status wires (locked, prog_empty,
// prog_full) feed back into the CSR.
//
// Mirrors the SpectrumAnalyzerDriver class on the host side.
//
//------------------------------------------------------------------------
// Copyright (c) 2026 Opal Kelly Incorporated
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//------------------------------------------------------------------------

`default_nettype none

module spectrum_analyzer(
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF m_axil, ASSOCIATED_RESET aresetn" *)
    input  wire                aclk,
    input  wire                aresetn,

    input  wire [8:0]          m_axil_awaddr,
    input  wire [2:0]          m_axil_awprot,
    input  wire                m_axil_awvalid,
    output wire                m_axil_awready,
    input  wire [31:0]         m_axil_wdata,
    input  wire                m_axil_wvalid,
    output wire                m_axil_wready,
    output wire [1:0]          m_axil_bresp,
    output wire                m_axil_bvalid,
    input  wire                m_axil_bready,
    input  wire [8:0]          m_axil_araddr,
    input  wire [2:0]          m_axil_arprot,
    input  wire                m_axil_arvalid,
    output wire                m_axil_arready,
    output wire [31:0]         m_axil_rdata,
    output wire [1:0]          m_axil_rresp,
    output wire                m_axil_rvalid,
    input  wire                m_axil_rready,

    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 okClk CLK" *)
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF m_axis:s_axis, FREQ_HZ 156250000" *)
    input  wire                okClk,

    output wire [63:0]         m_axis_tdata,
    output wire                m_axis_tvalid,
    input  wire                m_axis_tready,

    input  wire [31:0]         s_axis_tdata,
    input  wire                s_axis_tvalid,
    output wire                s_axis_tready,

    input  wire                fft_clk,
    input  wire                fft_clk_locked
);

    // Internal wires between fft_controller and rfft IP.
    wire [9:0]  fft_address_in;
    wire        fft_ce_in;
    wire        fft_ce_out;
    wire        fft_ready;
    wire        fft_done;
    wire        fft_idle;
    wire [47:0] fft_datain;
    wire        fft_start;
    wire        fft_reset;
    wire [13:0] fft_input_data;

    // CSR-driven control wires (sourced from spectrum_analyzer_csr).
    //   reset                  — wraps fft_controller's compute path
    //   start                  — pulses an FFT compute cycle
    //   fft_tx_fifo_prog_empty — TX FIFO has space for more samples
    //   fft_rx_fifo_prog_full  — RX FIFO has bins ready to read
    wire        reset;
    wire        start;
    wire        fft_tx_fifo_prog_empty;
    wire        fft_rx_fifo_prog_full;

    // GND tie-off bus for unused FFT IP ports.
    wire [47:0] gnd_48 = 48'd0;

    spectrum_analyzer_csr spectrum_analyzer_csr_i (
        .aclk              (aclk),
        .aresetn           (aresetn),

        .s_axil_awaddr     (m_axil_awaddr),
        .s_axil_awprot     (m_axil_awprot),
        .s_axil_awvalid    (m_axil_awvalid),
        .s_axil_awready    (m_axil_awready),
        .s_axil_wdata      (m_axil_wdata),
        .s_axil_wvalid     (m_axil_wvalid),
        .s_axil_wready     (m_axil_wready),
        .s_axil_bresp      (m_axil_bresp),
        .s_axil_bvalid     (m_axil_bvalid),
        .s_axil_bready     (m_axil_bready),
        .s_axil_araddr     (m_axil_araddr),
        .s_axil_arprot     (m_axil_arprot),
        .s_axil_arvalid    (m_axil_arvalid),
        .s_axil_arready    (m_axil_arready),
        .s_axil_rdata      (m_axil_rdata),
        .s_axil_rresp      (m_axil_rresp),
        .s_axil_rvalid     (m_axil_rvalid),
        .s_axil_rready     (m_axil_rready),

        .reset             (reset),                    // output
        .start             (start),                    // output
        .locked            (fft_clk_locked),           // input
        .prog_empty        (fft_tx_fifo_prog_empty),   // input
        .prog_full         (fft_rx_fifo_prog_full)     // input
    );

    fft_controller fft_controller_inst (
        .okClk           (okClk),

        .m_axis_tdata    (m_axis_tdata),
        .m_axis_tvalid   (m_axis_tvalid),
        .m_axis_tready   (m_axis_tready),

        .s_axis_tdata    (s_axis_tdata),
        .s_axis_tvalid   (s_axis_tvalid),
        .s_axis_tready   (s_axis_tready),

        .fft_address_in  (fft_address_in),
        .fft_ce_in       (fft_ce_in),
        .fft_ce_out      (fft_ce_out),
        .fft_ready       (fft_ready),
        .fft_done        (fft_done),
        .fft_idle        (fft_idle),
        .fft_clk         (fft_clk),
        .fft_clk_locked  (fft_clk_locked),
        .fft_datain      (fft_datain),

        .fft_start       (fft_start),
        .fft_reset       (fft_reset),
        .fft_input_data  (fft_input_data),

        .reset                  (reset),
        .start                  (start),
        .fft_tx_fifo_prog_empty (fft_tx_fifo_prog_empty),
        .fft_rx_fifo_prog_full  (fft_rx_fifo_prog_full)
    );

    rfft_0 rfft_inst (
        .ap_clk           (fft_clk),
        .ap_rst           (fft_reset),
        .ap_start         (fft_start),
        .ap_done          (fft_done),
        .ap_idle          (fft_idle),
        .ap_ready         (fft_ready),

        .dataIn_address0  (fft_address_in),
        .dataIn_ce0       (fft_ce_in),
        .dataIn_q0        (fft_input_data),
        .dataIn_q1        (gnd_48[13:0]),

        .dataOut_ce0      (fft_ce_out),
        .dataOut_d0       (fft_datain),
        .dataOut_q0       (gnd_48),
        .dataOut_q1       (gnd_48)
    );

endmodule

`default_nettype wire
