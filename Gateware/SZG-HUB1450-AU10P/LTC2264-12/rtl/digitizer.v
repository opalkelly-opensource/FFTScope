`timescale 1ns / 1ps
//------------------------------------------------------------------------
// digitizer.v
//
// This is the top level module that instantiates the top level ADC file and 
// handles reset procedures. This module receives the data from the adc and 
// places it into a FIFO, where it can be read out through an AXI Stream interface. 
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

`timescale 1ns / 1ps
`default_nettype none

module digitizer(
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
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF m_axis, FREQ_HZ 156250000" *)
    input  wire                okClk,
    
    output wire                adc_data_clk,
    
    output wire [63:0]         m_axis_tdata,
    output wire                m_axis_tvalid,
    input  wire                m_axis_tready,
    
    input  wire                dac_clk,
    output wire [3:0]          led,
    
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

wire         reset;
wire         reset_sync;
wire         prog_full;
wire         fifo_empty;
wire         adc_data_valid;
wire         fill_fifo;

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

digitizer_csr digitizer_csr_i (
    .aclk                  (aclk),
    .aresetn               (aresetn),

    .s_axil_awaddr         (m_axil_awaddr),
    .s_axil_awprot         (m_axil_awprot),
    .s_axil_awvalid        (m_axil_awvalid),
    .s_axil_awready        (m_axil_awready),
    .s_axil_wdata          (m_axil_wdata),
    .s_axil_wvalid         (m_axil_wvalid),
    .s_axil_wready         (m_axil_wready),
    .s_axil_bresp          (m_axil_bresp),
    .s_axil_bvalid         (m_axil_bvalid),
    .s_axil_bready         (m_axil_bready),
    .s_axil_araddr         (m_axil_araddr),
    .s_axil_arprot         (m_axil_arprot),
    .s_axil_arvalid        (m_axil_arvalid),
    .s_axil_arready        (m_axil_arready),
    .s_axil_rdata          (m_axil_rdata),
    .s_axil_rresp          (m_axil_rresp),
    .s_axil_rvalid         (m_axil_rvalid),
    .s_axil_rready         (m_axil_rready),

    .reset                 (reset),     // output
    .fill_fifo             (fill_fifo), // output
    .adc_fifo_prog_full    (prog_full)  // input
);

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

assign led = {1'd0, fifo_busy, adc_rdy, prog_full};

assign m_axis_tvalid = !fifo_empty;

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
            if (reset_sync) begin
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

cdc_sync_2ff cdc_sync_2ff_reset_i (
    .clk_dst  (okClk),
    .async_in (reset),
    .sync_out (reset_sync)
);

cdc_sync_2ff cdc_sync_2ff_adc_rdy_i (
    .clk_dst  (okClk),
    .async_in (adc_rdy),
    .sync_out (adc_rdy_sync)
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

cdc_sync_2ff cdc_sync_2ff_fifo_busy_i (
    .clk_dst  (adc_data_clk),
    .async_in (fifo_busy),
    .sync_out (fifo_busy_sync)
);

 // Sending ADC samples to the host
 //
 // Each cycle delivers a channel pair as two signed Int16s. The
 // gateware packs channel 1 into the high 16 bits of a 32-bit FIFO
 // write and channel 2 into the low 16 bits.
 //
 // The FIFO is asymmetric 32-in / 64-out. Per Xilinx PG057, the wider-
 // read configuration fills the most-significant subword first:
 //   first  32-bit write -> dout[63:32]   (pair_a, older)
 //   second 32-bit write -> dout[31:0]    (pair_b, newer)
 //
 // The AXI Stream transports each 64-bit beat onto the wire LSB-first:
 //   bits [7:0]   -> host byte 0
 //   bits [15:8]  -> host byte 1
 //   ...
 //   bits [63:56] -> host byte 7
 //
 // The .dout map below routes each Int16 to the byte offset the host expects.
 //
 // The host reads, per beat (JavaScript):
 //   samples.getInt16(0, true) -> pair_a ch1 (oldest)
 //   samples.getInt16(2, true) -> pair_a ch2
 //   samples.getInt16(4, true) -> pair_b ch1
 //   samples.getInt16(6, true) -> pair_b ch2 (newest)
 //
 // The `true` argument tells JavaScript's DataView.getInt16(byteOffset,
 // littleEndian) to interpret the bytes little-endian, matching the
 // wire; omitting it defaults to big-endian and silently produces
 // garbage. Other host languages need an equivalent little-endian read.
 fifo_generator_0 fifo(
    .wr_clk         (adc_data_clk),
    .rd_clk         (okClk),
    .rst            (fifo_reset),
    .din            ({adc_int16_1, adc_int16_2}),
    .wr_en          ({wr_en & ~fifo_busy_sync}),
    .rd_en          ({m_axis_tvalid && m_axis_tready && ~fifo_busy}),
    .dout           ({m_axis_tdata[15:0],   // FIFO dout[63:48] = pair_a ch1
                      m_axis_tdata[31:16],  // FIFO dout[47:32] = pair_a ch2
                      m_axis_tdata[47:32],  // FIFO dout[31:16] = pair_b ch1
                      m_axis_tdata[63:48]}),// FIFO dout[15:0]  = pair_b ch2
    .full           (fifo_full),
    .wr_rst_busy    (wr_rst_busy),
    .rd_rst_busy    (rd_rst_busy),
    .empty          (fifo_empty),
    .prog_full      (prog_full)
);

endmodule
`default_nettype wire
