//------------------------------------------------------------------------
// waveform_generator_csr.v
//
// Control and status register block.
//
// Copyright (c) 2026  Opal Kelly Incorporated
//------------------------------------------------------------------------
//
// Register Map (addresses shown as lower 32 bits of 64-bit address)
//
//  Address     Name            Bits         Access   Description
//  ----------  --------------  -----------  -------  ------------------------------
//  0x0000_0000 CONTROL         [0]          R/W      Reset
//                              [1]          R/W      dac_disable
//                              [31:2]       R/W      Reserved
//
//  0x0000_0040 TRIG_CTRL       [0]          WO       start
//                              [31:1]       WO       Reserved
//    Notes: Each bit written as '1' in this 32-bit register produces a 
//           one-cycle pulse (0 → 1 → 0 over successive cycles) on that bit; 
//           multiple bits can pulse simultaneously.
//
//  0x0000_0060 STATUS          [0]          RO       locked
//                              [1]          RO       dac_ready
//                              [31:2]       RO       Reserved
//
//  0x0000_2000 –
//  0x0000_3FFF VECTORS         [31:0]       R/W      BRAM-backed vector space
//
// Access types:
//   R/W  = Read/Write
//   RO   = Read Only
//   WO   = Write Only
//
//------------------------------------------------------------------------

`timescale 1ns / 1ps
`default_nettype none

module waveform_generator_csr (
    input  wire        aclk,
    input  wire        aresetn,

    input  wire [13:0] s_axil_awaddr,
    input  wire [2:0]  s_axil_awprot,
    input  wire        s_axil_awvalid,
    output reg         s_axil_awready,
    input  wire [31:0] s_axil_wdata,
    input  wire        s_axil_wvalid,
    output reg         s_axil_wready,
    output reg [1:0]   s_axil_bresp,
    output reg         s_axil_bvalid,
    input  wire        s_axil_bready,
    input  wire [13:0] s_axil_araddr,
    input  wire [2:0]  s_axil_arprot,
    input  wire        s_axil_arvalid,
    output reg         s_axil_arready,
    output reg [31:0]  s_axil_rdata,
    output reg [1:0]   s_axil_rresp,
    output reg         s_axil_rvalid,
    input  wire        s_axil_rready,

    output wire        reset,
    output wire        dac_disable,
    output wire        start,
    input  wire        locked,
    input  wire        dac_ready,

    output reg         bram_wea,
    output reg [10:0]  bram_addr,
    input  wire [31:0] bram_din,
    output reg [31:0]  bram_dout
);

localparam [63:0] CSR_ADDR_CONTROL      = 64'h0000_0000;
localparam [63:0] CSR_ADDR_TRIG_CTRL    = 64'h0000_0040;
localparam [63:0] CSR_ADDR_STATUS       = 64'h0000_0060;

// 8KB window: 0x2000 - 0x3FFF
localparam [63:0] CSR_ADDR_VECTORS_BASE = 64'h0000_0000_0000_2000;

localparam [1:0] SLVERR = 2'b10;

reg  [31:0] control_reg;
reg  [31:0] trig_ctrl_reg;
wire [31:0] status_reg;
reg  [1:0]  read_latency_count;

assign reset       = control_reg[0];
assign dac_disable = control_reg[1];
assign start       = trig_ctrl_reg[0];

assign status_reg = {30'd0, dac_ready, locked};

always @(posedge aclk) begin
    if (~aresetn) begin
        control_reg             <= 32'd0;
        trig_ctrl_reg           <= 32'd0;

        read_latency_count      <= 2'd0;

        bram_wea                <= 1'b0;
        bram_addr               <= 11'd0;
        bram_dout               <= 32'd0;

        s_axil_awready          <= 1'b0;
        s_axil_wready           <= 1'b0;
        s_axil_bvalid           <= 1'b0;
        s_axil_bresp            <= 2'b00;
        s_axil_arready          <= 1'b0;
        s_axil_rvalid           <= 1'b0;
        s_axil_rresp            <= 2'b00;
        s_axil_rdata            <= 32'd0;
    end else begin
        trig_ctrl_reg <= 32'd0;
        bram_wea <= 1'b0;
        read_latency_count <= 2'd0;

        s_axil_awready <= 1'b0;
        s_axil_wready  <= 1'b0;
        s_axil_bvalid  <= s_axil_bvalid && !s_axil_bready;

        if (s_axil_awvalid && s_axil_wvalid && !s_axil_bvalid) begin
            s_axil_awready <= 1'b1;
            s_axil_wready  <= 1'b1;
            s_axil_bresp   <= 2'b00;
            s_axil_bvalid  <= 1'b1;

            casez (s_axil_awaddr)
                CSR_ADDR_CONTROL:   control_reg   <= s_axil_wdata;
                CSR_ADDR_TRIG_CTRL: trig_ctrl_reg <= s_axil_wdata;

                {CSR_ADDR_VECTORS_BASE[63:13], 13'h???}: begin
                    bram_wea  <= 1'b1;
                    bram_addr <= s_axil_awaddr >> 2;
                    bram_dout <= s_axil_wdata;
                end

                default: s_axil_bresp <= SLVERR;
            endcase
        end

        s_axil_arready <= 1'b0;
        s_axil_rvalid  <= s_axil_rvalid && !s_axil_rready;

        if (s_axil_arvalid && !s_axil_rvalid) begin
            s_axil_arready <= 1'b1;
            s_axil_rresp   <= 2'b00;
            s_axil_rvalid  <= 1'b1;

            casez (s_axil_araddr)
                CSR_ADDR_CONTROL: s_axil_rdata <= control_reg;
                CSR_ADDR_STATUS:  s_axil_rdata <= status_reg;

                {CSR_ADDR_VECTORS_BASE[63:13], 13'h???}: begin                   
                    if (read_latency_count == 2'd0) begin
                        // Capture BRAM address on first cycle
                        bram_addr <= s_axil_araddr >> 2;
                        read_latency_count <= read_latency_count + 2'd1;

                        s_axil_rvalid  <= 1'b0;
                        s_axil_arready <= 1'b0;
                    end else if (read_latency_count < 2'd2) begin
                        // Counts 0->1->2, then stays at 2
                        read_latency_count <= read_latency_count + 2'd1;

                        s_axil_rvalid  <= 1'b0;
                        s_axil_arready <= 1'b0;
                    end else begin
                        // Hold off returning the read response until count reaches 2
                        s_axil_rvalid  <= 1'b1;
                        s_axil_arready <= 1'b1;
                        s_axil_rdata   <= bram_din;
                    end
                end

                default:              s_axil_rresp <= SLVERR;
            endcase
        end
    end
end

endmodule
`default_nettype wire
