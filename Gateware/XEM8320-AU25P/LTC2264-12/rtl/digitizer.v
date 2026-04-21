`timescale 1ns / 1ps
//------------------------------------------------------------------------
// digitizer.v
//
// This is the top level module that instantiates the top level ADC file and 
// handles reset procedures. This module receives the data from the adc and 
// places it into a FIFO, where it can be read out through a pipe at endpoint 0xA0. 
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


module digitizer(

    // FrontPanel endpoints owned by digitizer. Each subblock owns
    // its own endpoint set (no sharing across subblocks); see Phase 4.
    (* X_INTERFACE_INFO = "opalkelly.com:interface:wirein:1.0 wirein01 EP_DATAOUT" *)
    input  wire [31:0]         wi01_ep_dataout,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:wireout:1.0 wireout21 EP_DATAIN" *)
    output wire [31:0]         wo21_ep_datain,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:triggerin:1.0 triggerin42 EP_TRIGGER" *)
    input  wire [31:0]         ti42_ep_trigger,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:triggerin:1.0 triggerin42 EP_CLK" *)
    output wire                ti42_ep_clk,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:pipeout:1.0 pipeouta0 EP_DATAIN" *)
    output wire [31:0]         poa0_data_out,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:pipeout:1.0 pipeouta0 EP_READ" *)
    input  wire                poa0_ep_read,

    input  wire                dac_clk,
    input  wire                okClk,
    input  wire                locked,
    output wire [4:0]          led,
    
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x out1_p" *)
    input  wire [1:0]          adc_out_1p,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x out1_n" *)
    input  wire [1:0]          adc_out_1n,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x out2_p" *)
    input  wire [1:0]          adc_out_2p,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x out2_n" *)
    input  wire [1:0]          adc_out_2n,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x dco_p" *)
    input  wire                adc_dco_p,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x dco_n" *)
    input  wire                adc_dco_n,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x fr_p" *)
    input  wire                adc_fr_p,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x fr_n" *)
    input  wire                adc_fr_n,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x enc_p" *)
    output wire                adc_encode_p,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x enc_n" *)
    output wire                adc_encode_n,

    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x sdo" *)
    input  wire                adc_sdo,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x sdi" *)
    output wire                adc_sdi,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x cs_b" *)
    output wire                adc_cs_n,
    (* X_INTERFACE_INFO = "opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0 szg_adc_ltc226x sclk" *)
    output wire                adc_sck
    );

wire [31:0]  pipea0_data;

wire         adc_rdy;
wire         adc_rdy_sync;
wire         idelay_ref;
wire         sys_clk_ibuf;
wire         sys_clk_bufg;
wire         rd_rst_busy;
wire         wr_rst_busy;
wire [15:0]  adc_data_out1, adc_data_out2;
wire         fifo_full;
reg          wr_en = 1'b0;
reg          fifo_reset;
reg          fifo_busy;
wire         fifo_busy_sync;

// Preparing ADC samples for the host
//
// Convert offset-binary ADC samples to signed two's-complement so the
// host can read them as native Int16 values. The LTC2264 (12-bit ADC)
// outputs each sample MSB-aligned in a 16-bit serializer word: the top
// 12 bits are the sample, the bottom 4 bits are zero padding.
//
// Conversion (per channel):
//   1. Extract the 12-bit unsigned sample from bits [15:4].
//   2. Subtract midscale (0x800) so the result is signed in the ADC's
//      native range.
//   3. Sign-extend to 16 bits to fill the Int16.
//
// The FIFO packing and host-side decode are described below.
//
// Alternative: configure the ADC for two's-complement output via SPI at
// startup. The current design has no ADC SPI master, so this conversion
// happens in gateware. If a future revision adds ADC SPI control, this
// block can be removed.
wire [11:0] adc_signed_1 = adc_data_out1[15:4] - 12'h800;
wire [11:0] adc_signed_2 = adc_data_out2[15:4] - 12'h800;
wire [15:0] adc_int16_1  = {{4{adc_signed_1[11]}}, adc_signed_1};
wire [15:0] adc_int16_2  = {{4{adc_signed_2[11]}}, adc_signed_2};

assign reset = wi01_ep_dataout[0];
assign poa0_data_out = pipea0_data;
assign ti42_ep_clk = adc_data_clk;
assign fill_fifo = ti42_ep_trigger[0];
assign led = {2'd0, fifo_busy, adc_rdy, prog_full};

// WireOut status — bit fields owned by digitizer (no sharing):
//   [0] CLOCK_LOCKED      — clk_wiz/locked, duplicated per subblock
//   [1] ADC_FIFO_PROG_FULL — capture FIFO has enough samples
//
// `locked` is async (MMCM output) and `prog_full` is in the adc_data_clk
// write-side domain; both cross into okClk through a 2FF synchronizer
// before the host samples them over the WireOut.
wire locked_sync;
wire prog_full_sync;

cdc_sync_2ff cdc_sync_2ff_wo21_locked_i (
    .clk_dst  (okClk),
    .async_in (locked),
    .sync_out (locked_sync)
);

cdc_sync_2ff cdc_sync_2ff_wo21_prog_full_i (
    .clk_dst  (okClk),
    .async_in (prog_full),
    .sync_out (prog_full_sync)
);

assign wo21_ep_datain = {30'd0, prog_full_sync, locked_sync};

always @ (posedge adc_data_clk) begin
    if (adc_rdy && !prog_full && adc_data_valid) begin 
        if (fill_fifo) begin                // fifo wr_en logic to ensure the fifo:                       
            wr_en <= 1'b1;                  // operates after all SERDES modules are ready,              
        end                                 // isn't full, the adc data is valid (bitslip), and     
    end                                     // isn't resetting. 
    else begin                                                                                          
        wr_en <= 1'b0;                      
    end
end

reg [7:0] delay_counter = 8'd0;
reg [1:0] state;
localparam idle = 0,
           wait_for_lock = 3,
           reset_state = 1,
           delay_wait = 2;

// Worst case is using ADC-12 project, in which
// okClk (100.8 MHz) is 2.52x faster than adc_clk (40 MHz)
// first wait for MMCM to lock, then the
// reset should be asserted for 21 cycles,
// and then should wait for 152 cycles, for a
// total of 173 cycles the FIFO is resetting.
// See PG057 Figure 3-29 for more information.
always @ (posedge okClk) begin
    case (state)
        idle: begin
            if (reset) begin
                fifo_reset <= 1'b1;
                state <= wait_for_lock;
                fifo_busy <= 1'b1;
            end
            else begin
                fifo_busy <= 1'b0;
                fifo_reset <= 1'b0;
            end
        end
        
        wait_for_lock: begin // wait for MMCM to lock
            // adc_rdy is in adc_data_clk; use the okClk-synced version here.
            if (adc_rdy_sync) begin
                delay_counter <= 8'd21;
                state <= reset_state;
            end
        end
        
        reset_state: begin // assert reset for 21 cycles after MMCM is locked
            delay_counter <= delay_counter - 1'b1;
            if (delay_counter == 8'd0) begin
                fifo_reset <= 1'b0;
                delay_counter <= 8'd152;
                state <= delay_wait;
            end 
        end
        
        delay_wait: begin // deassert fifo_busy after 152 cycles
            delay_counter <= delay_counter - 1'b1;
            if (delay_counter == 8'd0) begin
                fifo_busy <= 1'b0;
                state <= idle;
            end
        end
    endcase
end

// adc_rdy is produced in adc_data_clk; the reset FSM above runs on okClk
// and gates the 21+152-cycle FIFO reset window on it. Sync into okClk
// so a metastable sample can't launch the reset while the ADC/IDELAY
// aren't actually stable.
cdc_sync_2ff cdc_sync_2ff_adc_rdy_i (
    .clk_dst  (okClk),
    .async_in (adc_rdy),
    .sync_out (adc_rdy_sync)
);

// fifo_busy is driven by the okClk reset FSM above but is used on the
// adc_data_clk side of the FIFO to mask wr_en during and just after a
// reset. Sync into adc_data_clk so writes can't leak in on the
// deassertion edge before the write-clock side has seen it drop.
cdc_sync_2ff cdc_sync_2ff_fifo_busy_i (
    .clk_dst  (adc_data_clk),
    .async_in (fifo_busy),
    .sync_out (fifo_busy_sync)
);

adc_top adc_impl(
    .clk           (dac_clk),
    .reset_async   (reset),
    .adc_out_1p    (adc_out_1p),
    .adc_out_1n    (adc_out_1n),
    .adc_out_2p    (adc_out_2p),
    .adc_out_2n    (adc_out_2n),
    .adc_dco_p     (adc_dco_p),
    .adc_dco_n     (adc_dco_n),
    .adc_fr_p      (adc_fr_p),
    .adc_fr_n      (adc_fr_n),
    .adc_encode_p  (adc_encode_p),
    .adc_encode_n  (adc_encode_n),
    .adc_sdo       (adc_sdo),
    .adc_sdi       (adc_sdi),
    .adc_cs_n      (adc_cs_n),
    .adc_sck       (adc_sck),
    .adc_data_clk  (adc_data_clk),
    .adc_data_1    (adc_data_out1),
    .adc_data_2    (adc_data_out2),
    .data_valid    (adc_data_valid),
    .rdy           (adc_rdy)
);

 // Sending ADC samples to the host
 //
 // Each sample arrives as a signed Int16, converted from offset-binary
 // in the block above. The gateware packs channel 1 into the low 16
 // bits of a 32-bit FIFO write and channel 2 into the high 16 bits.
 // The FIFO is symmetric 32-in / 32-out; bits exit where they entered.
 //
 // The pipe transports each 32-bit word onto the wire LSB-first:
 //   bits [7:0]   -> host byte 0
 //   bits [15:8]  -> host byte 1
 //   bits [23:16] -> host byte 2
 //   bits [31:24] -> host byte 3
 //
 // The host reads (JavaScript):
 //   samples.getInt16(0, true) -> channel 1
 //   samples.getInt16(2, true) -> channel 2
 //
 // The `true` argument tells JavaScript's DataView.getInt16(byteOffset,
 // littleEndian) to interpret the bytes little-endian, matching the
 // wire; omitting it defaults to big-endian and silently produces
 // garbage. Other host languages need an equivalent little-endian read.
 fifo_generator_0 fifo(
    .wr_clk         (adc_data_clk),
    .rd_clk         (okClk),
    .rst            (fifo_reset),
    .din            ({adc_int16_2, adc_int16_1}),
    .wr_en          ({wr_en & ~fifo_busy_sync}),
    .rd_en          ({poa0_ep_read & ~fifo_busy}),
    .dout           (pipea0_data),
    .full           (fifo_full),
    .wr_rst_busy    (wr_rst_busy),
    .rd_rst_busy    (rd_rst_busy),
    .empty          (),
    .prog_full      (prog_full)
);
endmodule
