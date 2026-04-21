//------------------------------------------------------------------------
// digitizer_csr.v
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
//                              [31:1]       R/W      Reserved
//
//  0x0000_0040 TRIG_CTRL       [0]          WO       fill_fifo
//                              [31:1]       WO       Reserved
//    Notes: Each bit written as '1' in this 32-bit register produces a
//           one-cycle pulse (0 → 1 → 0 over successive cycles) on that bit;
//           multiple bits can pulse simultaneously.
//
//  0x0000_0060 STATUS          [0]          RO       adc_fifo_prog_full
//                              [31:1]       RO       Reserved
//
// Access types:
//   R/W = Read & Write
//   RO  = Read Only
//   WO  = Write Only
//
//------------------------------------------------------------------------

`timescale 1ns / 1ps
`default_nettype none

module digitizer_csr (
    input  wire        aclk,
    input  wire        aresetn,

    input  wire [8:0] s_axil_awaddr,
    input  wire [2:0]  s_axil_awprot,
    input  wire        s_axil_awvalid,
    output reg         s_axil_awready,
    input  wire [31:0] s_axil_wdata,
    input  wire        s_axil_wvalid,
    output reg         s_axil_wready,
    output reg [1:0]   s_axil_bresp,
    output reg         s_axil_bvalid,
    input  wire        s_axil_bready,
    input  wire [8:0] s_axil_araddr,
    input  wire [2:0]  s_axil_arprot,
    input  wire        s_axil_arvalid,
    output reg         s_axil_arready,
    output reg [31:0]  s_axil_rdata,
    output reg [1:0]   s_axil_rresp,
    output reg         s_axil_rvalid,
    input  wire        s_axil_rready,

    output wire        reset,
    output wire        fill_fifo,
    input  wire        adc_fifo_prog_full
);

localparam [63:0] CSR_ADDR_CONTROL    = 64'h0000_0000;
localparam [63:0] CSR_ADDR_TRIG_CTRL  = 64'h0000_0040;
localparam [63:0] CSR_ADDR_STATUS     = 64'h0000_0060;

localparam [1:0] SLVERR = 2'b10;

reg  [31:0] control_reg;
reg  [31:0] trig_ctrl_reg;

wire [31:0] status_reg;

assign reset     = control_reg[0];
assign fill_fifo = trig_ctrl_reg[0];

assign status_reg = {31'd0, adc_fifo_prog_full};

always @(posedge aclk) begin
    if (~aresetn) begin
        control_reg     <= 32'd0;
        trig_ctrl_reg   <= 32'd0;

        s_axil_awready  <= 1'b0;
        s_axil_wready   <= 1'b0;
        s_axil_bvalid   <= 1'b0;
        s_axil_bresp    <= 2'b00;
        s_axil_arready  <= 1'b0;
        s_axil_rvalid   <= 1'b0;
        s_axil_rresp    <= 2'b00;
        s_axil_rdata    <= 32'd0;
    end else begin
        trig_ctrl_reg   <= 32'd0;

        s_axil_awready  <= 1'b0;
        s_axil_wready   <= 1'b0;
        s_axil_bvalid   <= s_axil_bvalid && !s_axil_bready;

        if (s_axil_awvalid && s_axil_wvalid && !s_axil_bvalid) begin
            s_axil_awready <= 1'b1;
            s_axil_wready  <= 1'b1;
            s_axil_bresp   <= 2'b00;
            s_axil_bvalid  <= 1'b1;

            case (s_axil_awaddr)
                CSR_ADDR_CONTROL:   control_reg   <= s_axil_wdata;
                CSR_ADDR_TRIG_CTRL: trig_ctrl_reg <= s_axil_wdata;
                default:            s_axil_bresp  <= SLVERR;
            endcase
        end

        s_axil_arready <= 1'b0;
        s_axil_rvalid  <= s_axil_rvalid && !s_axil_rready;

        if (s_axil_arvalid && !s_axil_rvalid) begin
            s_axil_arready <= 1'b1;
            s_axil_rresp   <= 2'b00;
            s_axil_rvalid  <= 1'b1;

            case (s_axil_araddr)
                CSR_ADDR_CONTROL: s_axil_rdata <= control_reg;
                CSR_ADDR_STATUS:  s_axil_rdata <= status_reg;
                default:          s_axil_rresp <= SLVERR;
            endcase
        end
    end
end

endmodule
`default_nettype wire
