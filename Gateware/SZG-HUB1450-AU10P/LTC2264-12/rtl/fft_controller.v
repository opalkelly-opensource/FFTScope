`timescale 1ns / 1ps
//------------------------------------------------------------------------
// fft_controller.v
//
// Handles interfacing to the Vitis HLS FFT IP. Owns the TX FIFO that
// buffers host-supplied time-domain samples on their way to the FFT,
// and the RX FIFO that buffers FFT bin output on its way back to the
// host. The FFT state machine sequences ap_start / ap_reset across the
// 14-cycle reset and 1024-cycle compute windows.
//
// Phase 5: the CSR no longer lives inside this module. The wrapper
// (spectrum_analyzer.v) instantiates spectrum_analyzer_csr at the top
// level. Control inputs (reset, start) are fed in from the wrapper;
// FIFO program-empty / program-full status outputs go back out to the
// wrapper-level CSR.
//
//------------------------------------------------------------------------
// Copyright (c) 2024 Opal Kelly Incorporated
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

module fft_controller(
    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 okClk CLK" *)
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF m_axis:s_axis, FREQ_HZ 156250000" *)
    input  wire                okClk,

    output wire [63:0]         m_axis_tdata,
    output wire                m_axis_tvalid,
    input  wire                m_axis_tready,

    input  wire [31:0]         s_axis_tdata,
    input  wire                s_axis_tvalid,
    output  wire               s_axis_tready,

    input wire [9:0] fft_address_in,
    input wire fft_ce_in,
    input wire fft_ce_out,
    input wire fft_ready,
    input wire fft_done,
    input wire fft_idle,
    input wire fft_clk,
    input wire fft_clk_locked,
    input wire [47:0] fft_datain,

    output wire fft_start,
    output wire fft_reset,
    output wire [11:0] fft_input_data,

    // Control inputs from the wrapper-level CSR.
    input  wire        reset,
    input  wire        start,

    // FIFO status outputs back to the wrapper-level CSR.
    output wire        fft_tx_fifo_prog_empty,
    output wire        fft_rx_fifo_prog_full
    );

  wire fifo_empty;
  wire fifo_full;

  wire [63:0] bram_data;
  wire rsta_busy, rsta_busy_sync, rstb_busy;
  wire [15:0] fifo_out;
  wire tx_fifo_rst_busy;
  reg fft_start_r = 1'b0;
  reg fft_reset_r = 1'b0;
  reg [3:0] fft_reset_counter = 4'd0;
  reg [10:0] fft_ready_counter = 11'd0;

  assign fft_start = fft_start_r;
  assign fft_reset = fft_reset_r;
  // fifo_out: signed Int16 sample from pipein 0x80
  //   bits  [11:0]  : signed 12-bit ADC sample, range [-2048, +2047]
  //   bits [15:12]  : sign extension of bit [11]
  //   produced by  : digitizer.v (offset-binary -> two's-comp, widened to Int16)
  //   consumed by  : HLS FFT IP, typed ap_fixed<12,1>, 12 bits forward as-is
  assign fft_input_data = fifo_out[11:0];

  assign tx_fifo_rst_busy = rsta_busy_sync | rstb_busy;

  // Preparing FFT bins for the host
  //
  // The HLS FFT core emits one bin as std::complex<ap_fixed<22,11>>,
  // packed by Vivado as 44 bits of data on the 48-bit fft_datain port:
  //   fft_datain[21:0]  = real (signed two's-complement, 22 bits)
  //   fft_datain[43:22] = imag (signed two's-complement, 22 bits)
  //   fft_datain[47:44] = zero padding
  //
  // Sign-extend each component to a full 32-bit signed value so the
  // host can read it as a native Int32. The FIFO packing and host-side
  // decode are described below.
  wire [31:0] fft_real_32 = {{10{fft_datain[21]}}, fft_datain[21:0]};
  wire [31:0] fft_imag_32 = {{10{fft_datain[43]}}, fft_datain[43:22]};

  assign m_axis_tvalid = !fifo_empty;
  assign s_axis_tready = !fifo_full;

  always @(posedge fft_clk) begin
    if (reset || !fft_clk_locked) begin // stay in reset if clock not locked or reset asserted
        fft_start_r <= 1'b0;
        fft_reset_r <= 1'b1;
        fft_reset_counter <= 4'd0;
        fft_ready_counter <= 11'd0;
    end else if (fft_reset_r) begin // reset counter
        if (fft_reset_counter != 4'd14) begin // assert reset for 14 cycles as shown in Vitis HLS test bench
            fft_reset_counter <= fft_reset_counter + 1'd1;
        end else begin
            fft_reset_r <= 1'b0;
        end
    end else if (start && !tx_fifo_rst_busy && fft_idle && !fft_start_r) begin // initate fft transaction
        fft_start_r <= 1'b1;
        fft_ready_counter <= 11'd0;
    end else if (fft_start_r) begin // keep fft_start asserted for 1024 + 1 cycles for BRAM latency
        if (fft_ready_counter != 11'd1024) begin
            fft_ready_counter <= fft_ready_counter + 1'b1;
        end else begin
            fft_start_r <= 1'b0;
        end
    end
  end

  cdc_sync_2ff cdc_sync_2ff_rsta_busy_i (
      .clk_dst  (fft_clk),
      .async_in (rsta_busy),
      .sync_out (rsta_busy_sync)
  );

  // Note the input and output widths of 16 and 32 bits, respectively. This FIFO handles sending the 14 bit wide data from the
  // host to the FFT using pipe 0x80. Since pipes are 32 bits wide, each pipe transaction contains two samples for the FFT.
  // The FFT core handles the read signals, and the pipe signals handle the write signals.
  fifo_generator_1 fft_tx_fifo(
  .srst(1'b0),                // input wire srst
  .wr_clk(okClk),            // input wire wr_clk
  .rd_clk(fft_clk),            // input wire rd_clk
  .din({s_axis_tdata[15:0],   s_axis_tdata[31:16]}),   // input wire [31:0] din
  .wr_en(s_axis_tvalid && s_axis_tready),              // input wire wr_en
  .rd_en(fft_ce_in),              // input wire rd_en
  .dout(fifo_out),                // output wire [15 : 0] dout
  .full(fifo_full),                // output wire full
  .prog_empty(fft_tx_fifo_prog_empty),          // output wire prog_empty (1018). Not allowed to do prog_full at 1024.
  .empty(),              // output wire empty
  .wr_rst_busy(rsta_busy),  // output wire wr_rst_busy
  .rd_rst_busy(rstb_busy)  // output wire rd_rst_busy
);

  // Sending FFT bins to the host
  //
  // Each FFT bin is packed into the FIFO's 64-bit input as
  // {fft_imag_32, fft_real_32}: imag in the high 32 bits, real in the
  // low 32. The FIFO is symmetric 64-in / 64-out, so each input beat
  // emerges as one AXI Stream beat with bits in the same positions.
  //
  // The AXI Stream transports each 64-bit beat onto the wire LSB-first:
  //   bits [7:0]   -> host byte 0
  //   bits [15:8]  -> host byte 1
  //   ...
  //   bits [63:56] -> host byte 7
  //
  // Putting real in the low 32 bits places its bytes first on the wire.
  //
  // The host reads, per bin (JavaScript):
  //   view.getInt32(off,   true) -> real Int32
  //   view.getInt32(off+4, true) -> imag Int32
  //
  // The `true` argument tells JavaScript's DataView.getInt32(byteOffset,
  // littleEndian) to interpret the bytes little-endian, matching the
  // wire; omitting it defaults to big-endian and silently produces
  // garbage. Other host languages need an equivalent little-endian read.
  fifo_generator_2 fft_rx_fifo(
  .rst(1'b0),                // input wire srst
  .wr_clk(fft_clk),            // input wire wr_clk
  .rd_clk(okClk),            // input wire rd_clk
  .din({fft_imag_32, fft_real_32}),                                    // input wire [63 : 0] din
  .wr_en(fft_ce_out),              // input wire wr_en
  .rd_en(m_axis_tvalid && m_axis_tready),              // input wire rd_en
  .dout(m_axis_tdata),         // output wire [63 : 0] dout
  .full(),                // output wire full
  .prog_full(fft_rx_fifo_prog_full),          // output wire prog_full (1024)
  .empty(fifo_empty)              // output wire empty
);

endmodule

`default_nettype wire
