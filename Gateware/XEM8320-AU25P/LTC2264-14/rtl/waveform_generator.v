`timescale 1ns / 1ps
//------------------------------------------------------------------------
// waveform_generator.v
//
// Top-level wrapper for the signal generator datapath. Combines the
// ifft_controller (BRAM + state machine + FrontPanel register-bridge
// interface), the HLS irfft IP core, and the dac_top peripheral
// (DAC PHY + SPI + data registers). Owns its own FrontPanel control
// plane: dedicated WireIn (control), WireOut (status), and TriggerIn
// (start + clk_wiz reset) endpoints — no signals shared with other
// subblocks (Phase 4: no fp_slicer).
//
// Mirrors the WaveformGeneratorDriver class on the host side: this
// is the gateware block that the driver talks to.
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
    input  wire        okClk,

    // FrontPanel endpoints owned by waveform_generator
    //
    //   WireIn 0x00:  [0] RESET, [1] DAC_DISABLE
    //   WireOut 0x20: [0] CLOCK_LOCKED, [1] DAC_READY
    //   TriggerIn 0x40: [0] IFFT_SUBMIT, [1] CLK_RESET
    //   RegisterBridge: BRAM-backed IFFT bin space (host writes IFFT
    //                   amplitudes here, ifft_controller reads them)
    (* X_INTERFACE_INFO = "opalkelly.com:interface:wirein:1.0 wirein00 EP_DATAOUT" *)
    input  wire [31:0] wi00_ep_dataout,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:wireout:1.0 wireout20 EP_DATAIN" *)
    output wire [31:0] wo20_ep_datain,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:triggerin:1.0 triggerin40 EP_TRIGGER" *)
    input  wire [31:0] ti40_ep_trigger,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:triggerin:1.0 triggerin40 EP_CLK" *)
    output wire        ti40_ep_clk,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:register_bridge:1.0 register_bridge EP_WRITE" *)
    input  wire        regbridge_ep_write,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:register_bridge:1.0 register_bridge EP_READ" *)
    input  wire        regbridge_ep_read,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:register_bridge:1.0 register_bridge EP_ADDRESS" *)
    input  wire [31:0] regbridge_ep_address,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:register_bridge:1.0 register_bridge EP_DATAOUT" *)
    input  wire [31:0] regbridge_ep_dataout,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:register_bridge:1.0 register_bridge EP_DATAIN" *)
    output wire [31:0] regbridge_ep_datain,

    input  wire        ifft_clk,
    input  wire        ifft_clk_locked,
    input  wire        dac_clk_shifted,

    // Output: drives the project-level clk_wiz/reset pin. Sourced
    // from triggerin40[1] (CLK_RESET). waveform_generator owns this
    // because the IFFT/DAC subsystem is the most clock-sensitive
    // and the no-sharing principle puts the trigger somewhere; the
    // host can use it to recover from a stuck PLL.
    output wire        clk_wiz_reset,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x db" *)
    output wire [11:0] dac_data_o,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x clkin" *)
    output wire        dac_clk_o,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x reset_pinmd" *)
    output wire        dac_reset_pinmd,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x sclk" *)
    output wire        dac_sclk,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x sdio_i" *)
    input  wire        dac_sdio_i,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x sdio_o" *)
    output wire        dac_sdio_o,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x sdio_t" *)
    output wire        dac_sdio_t,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_dac_ad911x_rtl:1.0 szg_dac_ad911x cs_b" *)
    output wire        dac_cs_n
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

    // Internal status from dac_top — packed into the WireOut.
    wire        dac_ready;

    // GND tie-off bus for unused IFFT IP ports.
    wire [47:0] gnd_48 = 48'd0;

    // WireIn control bits are held in the okClk domain; synchronize each
    // bit into ifft_clk before any sample-clock FSM consumes it. The raw
    // okClk-domain reset is also routed directly to ifft_bram port A
    // (which is clocked on okClk).
    wire        controller_reset_okclk = wi00_ep_dataout[0];
    wire        controller_reset;
    wire        dac_disable;

    cdc_sync_2ff cdc_sync_2ff_wi00_reset_i (
        .clk_dst  (ifft_clk),
        .async_in (controller_reset_okclk),
        .sync_out (controller_reset)
    );

    cdc_sync_2ff cdc_sync_2ff_wi00_dac_disable_i (
        .clk_dst  (ifft_clk),
        .async_in (wi00_ep_dataout[1]),
        .sync_out (dac_disable)
    );

    // Slice the TriggerIn pulses. IFFT_SUBMIT pulses the IFFT
    // controller's start; CLK_RESET drives the project-level
    // clk_wiz reset (the host can use it to recover from a stuck
    // PLL). The trigger pulse is registered in the ifft_clk domain
    // (via ti40_ep_clk) so the IFFT controller sees a clean pulse.
    wire        controller_start = ti40_ep_trigger[0];
    assign      clk_wiz_reset    = ti40_ep_trigger[1];
    assign      ti40_ep_clk      = ifft_clk;

    // WireOut status bits originate off-okClk (MMCM locked is async;
    // dac_ready is in ifft_clk). Synchronize each into okClk before
    // packing into the WireOut word.
    //   [0] CLOCK_LOCKED — clk_wiz/locked, duplicated per subblock
    //   [1] DAC_READY    — DAC controller has finished its SPI init
    wire        ifft_clk_locked_sync;
    wire        dac_ready_sync;

    cdc_sync_2ff cdc_sync_2ff_wo20_locked_i (
        .clk_dst  (okClk),
        .async_in (ifft_clk_locked),
        .sync_out (ifft_clk_locked_sync)
    );

    cdc_sync_2ff cdc_sync_2ff_wo20_dac_ready_i (
        .clk_dst  (okClk),
        .async_in (dac_ready),
        .sync_out (dac_ready_sync)
    );

    assign wo20_ep_datain = {30'd0, dac_ready_sync, ifft_clk_locked_sync};

    ifft_controller ifft_controller_inst (
        .okClk                  (okClk),
        .reset_okclk            (controller_reset_okclk),
        .regbridge_ep_write     (regbridge_ep_write),
        .regbridge_ep_read      (regbridge_ep_read),
        .regbridge_ep_address   (regbridge_ep_address),
        .regbridge_ep_dataout   (regbridge_ep_dataout),
        .regbridge_ep_datain    (regbridge_ep_datain),
        .ifft_address_in        (ifft_address_in),
        .ifft_ce_in             (ifft_ce_in),
        .ifft_ready             (ifft_ready),
        .ifft_done              (ifft_done),
        .ifft_idle              (ifft_idle),
        .ifft_clk               (ifft_clk),
        .ifft_clk_locked        (ifft_clk_locked),
        .start                  (controller_start),
        .reset                  (controller_reset),
        .ifft_start             (ifft_start),
        .ifft_reset             (ifft_reset),
        .ifft_input_data        (ifft_input_data)
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
        .reset            (controller_reset),

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
