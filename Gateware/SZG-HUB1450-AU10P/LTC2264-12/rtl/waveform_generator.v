`timescale 1ns / 1ps
//------------------------------------------------------------------------
// waveform_generator.v
//
// Top-level wrapper for the signal generator datapath. Combines the
// waveform_generator_csr (AXI-Lite slave + BRAM-port-A bus master),
// the ifft_controller (state machine + BRAM port B for the IRFFT),
// the HLS irfft IP core, and the dac_top peripheral (DAC PHY + SPI).
//
// Phase 5: the CSR lives at the wrapper top level, mirroring the
// digitizer.v pattern. Control wires (reset, dac_disable, start) come
// out of the CSR and fan to the controller and dac_top; status wires
// (locked, dac_ready) feed back into the CSR. The ifft_controller is
// purely the IFFT state machine + BRAM, with port A driven externally
// from the CSR through a passthrough bus.
//
// Mirrors the WaveformGeneratorDriver class on the host side.
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

module waveform_generator(
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF m_axil, ASSOCIATED_RESET aresetn" *)
    input  wire                aclk,
    input  wire                aresetn,

    input  wire [13:0]         m_axil_awaddr,
    input  wire [2:0]          m_axil_awprot,
    input  wire                m_axil_awvalid,
    output wire                m_axil_awready,
    input  wire [31:0]         m_axil_wdata,
    input  wire                m_axil_wvalid,
    output wire                m_axil_wready,
    output wire [1:0]          m_axil_bresp,
    output wire                m_axil_bvalid,
    input  wire                m_axil_bready,
    input  wire [13:0]         m_axil_araddr,
    input  wire [2:0]          m_axil_arprot,
    input  wire                m_axil_arvalid,
    output wire                m_axil_arready,
    output wire [31:0]         m_axil_rdata,
    output wire [1:0]          m_axil_rresp,
    output wire                m_axil_rvalid,
    input  wire                m_axil_rready,

    input  wire                ifft_clk,
    input  wire                ifft_clk_locked,
    input  wire                dac_clk_shifted,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x db" *)
    output wire [11:0]         dac_data_o,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x clkin" *)
    output wire                dac_clk_o,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x reset_pinmd" *)
    output wire                dac_reset_pinmd,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x sclk" *)
    output wire                dac_sclk,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x sdio_i" *)
    input  wire                dac_sdio_i,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x sdio_o" *)
    output wire                dac_sdio_o,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x sdio_t" *)
    output wire                dac_sdio_t,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x cs_b" *)
    output wire                dac_cs_n
);

    // Internal wires between ifft_controller and irfft IP.
    wire [9:0]  ifft_address_in;
    wire        ifft_ce_in;
    wire        ifft_ready;
    wire        ifft_done;
    wire        ifft_idle;
    wire        ifft_start;
    wire        ifft_reset;
    wire [43:0] ifft_input_data;

    // Internal wires between irfft IP and dac_top.
    wire [9:0]  ifft_addr;
    wire        ifft_ce;
    wire [11:0] dac_data_i;

    // CSR-driven control wires (sourced from waveform_generator_csr).
    //   reset       — wraps ifft_controller and dac_top
    //   dac_disable — squelches the DAC analog output
    //   start       — pulses an IFFT compute cycle
    //   dac_ready   — status from dac_top, fed back to the CSR
    wire        reset;
    wire        dac_disable;
    wire        start;
    wire        dac_ready;

    // BRAM port A passthrough between the CSR and ifft_controller's
    // ifft_bram. Names follow the CSR's port directions:
    //   bram_dout = CSR write data -> BRAM dina
    //   bram_din  = BRAM douta -> CSR read data
    wire        bram_wea;
    wire [10:0] bram_addr;
    wire [31:0] bram_din;
    wire [31:0] bram_dout;

    // GND tie-off bus for unused IFFT IP ports.
    wire [47:0] gnd_48 = 48'd0;

    waveform_generator_csr waveform_generator_csr_i (
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

        .reset             (reset),            // output
        .dac_disable       (dac_disable),      // output
        .start             (start),            // output
        .locked            (ifft_clk_locked),  // input
        .dac_ready         (dac_ready),        // input

        .bram_wea          (bram_wea),         // output
        .bram_addr         (bram_addr),        // output
        .bram_din          (bram_din),         // input
        .bram_dout         (bram_dout)         // output
    );

    ifft_controller ifft_controller_inst (
        .ifft_clk        (ifft_clk),
        .ifft_clk_locked (ifft_clk_locked),

        .ifft_address_in (ifft_address_in),
        .ifft_ce_in      (ifft_ce_in),
        .ifft_ready      (ifft_ready),
        .ifft_done       (ifft_done),
        .ifft_idle       (ifft_idle),
        .ifft_start      (ifft_start),
        .ifft_reset      (ifft_reset),
        .ifft_input_data (ifft_input_data),

        .reset           (reset),
        .start           (start),

        .bram_wea        (bram_wea),
        .bram_addr       (bram_addr),
        .bram_dout       (bram_dout),
        .bram_din        (bram_din)
    );

    irfft_0 irfft_inst (
        .ap_clk           (ifft_clk),
        .ap_rst           (ifft_reset),
        .ap_start         (ifft_start),
        .ap_done          (ifft_done),
        .ap_idle          (ifft_idle),
        .ap_ready         (ifft_ready),

        .dataIn_address0  (ifft_address_in),
        .dataIn_ce0       (ifft_ce_in),
        .dataIn_q0        (ifft_input_data),
        .dataIn_q1        (gnd_48[43:0]),

        .dataOut_address0 (ifft_addr),
        .dataOut_ce0      (ifft_ce),
        .dataOut_d0       (dac_data_i),
        .dataOut_q0       (gnd_48),
        .dataOut_q1       (gnd_48)
    );

    dac_top dac_top_inst (
        .dac_clk_i        (ifft_clk),
        .dac_clk_shifted  (dac_clk_shifted),
        .locked           (ifft_clk_locked),
        .reset            (reset),

        .ifft_addr        (ifft_addr),
        .dac_data_i       (dac_data_i),
        .dis_out          (dac_disable),
        .ifft_ce          (ifft_ce),

        .dac_data_o       (dac_data_o),
        .dac_clk_o        (dac_clk_o),
        .dac_reset_pinmd  (dac_reset_pinmd),
        .dac_sclk         (dac_sclk),
        .dac_sdio_i       (dac_sdio_i),
        .dac_sdio_o       (dac_sdio_o),
        .dac_sdio_t       (dac_sdio_t),
        .dac_cs_n         (dac_cs_n),

        .dac_ready        (dac_ready)
    );

endmodule

`default_nettype wire
