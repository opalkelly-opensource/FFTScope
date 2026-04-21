`timescale 1ns / 1ps
//------------------------------------------------------------------------
// spectrum_analyzer.v
//
// Top-level wrapper for the spectrum analyzer datapath. Combines the
// fft_controller (FIFOs + state machine + FrontPanel pipe interface)
// with the HLS rfft IP core. Owns its own FrontPanel control plane:
// dedicated WireIn (control), WireOut (status), and TriggerIn (start)
// endpoints — no signals shared with other subblocks (Phase 4: no
// fp_slicer).
//
// Mirrors the SpectrumAnalyzerDriver class on the host side: this is
// the gateware block that the driver talks to.
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
    input  wire        okClk,

    // FrontPanel endpoints owned by spectrum_analyzer
    //
    //   WireIn 0x02:  [0] RESET
    //   WireOut 0x22: [0] CLOCK_LOCKED, [1] FFT_TX_PROG_EMPTY, [2] FFT_RX_PROG_FULL
    //   TriggerIn 0x41: [0] FFT_START
    //   PipeIn 0x80:    time-domain samples (host -> FFT)
    //   PipeOut 0xa1:   FFT bin output (FFT -> host)
    (* X_INTERFACE_INFO = "opalkelly.com:interface:wirein:1.0 wirein02 EP_DATAOUT" *)
    input  wire [31:0] wi02_ep_dataout,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:wireout:1.0 wireout22 EP_DATAIN" *)
    output wire [31:0] wo22_ep_datain,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:triggerin:1.0 triggerin41 EP_TRIGGER" *)
    input  wire [31:0] ti41_ep_trigger,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:triggerin:1.0 triggerin41 EP_CLK" *)
    output wire        ti41_ep_clk,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:pipein:1.0 pipein80 EP_DATAOUT" *)
    input  wire [31:0] pi80_ep_dataout,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:pipein:1.0 pipein80 EP_WRITE" *)
    input  wire        pi80_ep_write,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:pipeout:1.0 pipeouta1 EP_DATAIN" *)
    output wire [31:0] poa1_data_out,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:pipeout:1.0 pipeouta1 EP_READ" *)
    input  wire        poa1_ep_read,

    input  wire        fft_clk,
    input  wire        fft_clk_locked
);

    // Internal wires between fft_controller and rfft IP. Previously these
    // were ~12 individual nets in the block design.
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

    // Status nets from fft_controller — packed into the WireOut.
    wire        fft_tx_fifo_prog_empty;
    wire        fft_rx_fifo_prog_full;

    // GND tie-off bus for unused FFT IP ports. Replaces the GND xlconstant
    // that the block design previously fanned to dataIn_q1, dataOut_q0,
    // and dataOut_q1.
    wire [47:0] gnd_48 = 48'd0;

    // WireIn RESET is held in the okClk domain; the fft_controller FSM
    // samples it on fft_clk, so synchronize before crossing.
    wire        controller_reset;

    cdc_sync_2ff cdc_sync_2ff_wi02_reset_i (
        .clk_dst  (fft_clk),
        .async_in (wi02_ep_dataout[0]),
        .sync_out (controller_reset)
    );

    // Slice the TriggerIn pulses. The trigger pulse is registered in the
    // fft_clk domain (via ti41_ep_clk) so the consumer sees a clean pulse.
    wire        controller_start = ti41_ep_trigger[0];
    assign      ti41_ep_clk = fft_clk;

    // WireOut status bits come from off-okClk sources (MMCM locked is
    // async; the FIFO flags live on fft_clk). Synchronize each into
    // okClk before packing.
    //   [0] CLOCK_LOCKED      — clk_wiz/locked, duplicated per subblock
    //   [1] FFT_TX_PROG_EMPTY — input FIFO has space for more samples
    //   [2] FFT_RX_PROG_FULL  — output FIFO has bins ready to read
    wire        fft_clk_locked_sync;
    wire        fft_tx_fifo_prog_empty_sync;
    wire        fft_rx_fifo_prog_full_sync;

    cdc_sync_2ff cdc_sync_2ff_wo22_locked_i (
        .clk_dst  (okClk),
        .async_in (fft_clk_locked),
        .sync_out (fft_clk_locked_sync)
    );

    cdc_sync_2ff cdc_sync_2ff_wo22_tx_prog_empty_i (
        .clk_dst  (okClk),
        .async_in (fft_tx_fifo_prog_empty),
        .sync_out (fft_tx_fifo_prog_empty_sync)
    );

    cdc_sync_2ff cdc_sync_2ff_wo22_rx_prog_full_i (
        .clk_dst  (okClk),
        .async_in (fft_rx_fifo_prog_full),
        .sync_out (fft_rx_fifo_prog_full_sync)
    );

    assign wo22_ep_datain = {29'd0, fft_rx_fifo_prog_full_sync,
                                    fft_tx_fifo_prog_empty_sync,
                                    fft_clk_locked_sync};

    fft_controller fft_controller_inst (
        .okClk                  (okClk),
        .poa1_data_out          (poa1_data_out),
        .poa1_ep_read           (poa1_ep_read),
        .pi80_ep_dataout        (pi80_ep_dataout),
        .pi80_ep_write          (pi80_ep_write),
        .fft_address_in         (fft_address_in),
        .fft_ce_in              (fft_ce_in),
        .fft_ce_out             (fft_ce_out),
        .fft_ready              (fft_ready),
        .fft_done               (fft_done),
        .fft_idle               (fft_idle),
        .fft_clk                (fft_clk),
        .fft_clk_locked         (fft_clk_locked),
        .fft_datain             (fft_datain),
        .reset                  (controller_reset),
        .start                  (controller_start),
        .fft_start              (fft_start),
        .fft_reset              (fft_reset),
        .fft_input_data         (fft_input_data),
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
