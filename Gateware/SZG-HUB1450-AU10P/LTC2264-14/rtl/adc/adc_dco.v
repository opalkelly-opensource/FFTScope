//------------------------------------------------------------------------
// syzygy-adc-dco.v
//
// This module handles the data clock output from the ADC and provides the
// necessary signals required by the ISERDES input buffers.
// 
//------------------------------------------------------------------------
// Copyright (c) 2022-2024 Opal Kelly Incorporated
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

module adc_dco (
    input  wire  reset,

    input  wire  adc_dco_p,      // ADC Data clock
    input  wire  adc_dco_n,
    
    output wire  locked,

    output wire  clk,
    output wire  clk_div,
    output wire  clk_div_buf
    );

wire clk_out_int; // internal clock net

IBUFDS #(
    .IOSTANDARD ("LVDS"),
    .DIFF_TERM  ("TRUE")
) adc_dco_ibufds (
    .I  (adc_dco_p),
    .IB (adc_dco_n),
    .O  (clk_out_int)
);


wire clk_out1;

wire clkfbout;
wire clkfbout_buf;

MMCME4_ADV #(
    .BANDWIDTH            ("HIGH"),
    .CLKOUT4_CASCADE      ("FALSE"),
    .COMPENSATION         ("AUTO"),
    .STARTUP_WAIT         ("FALSE"),
    .DIVCLK_DIVIDE        (1),
    .CLKFBOUT_MULT_F      (4.875),
    .CLKFBOUT_PHASE       (0.000),
    .CLKFBOUT_USE_FINE_PS ("FALSE"),
    .CLKOUT0_DIVIDE_F     (4.875),
    .CLKOUT0_PHASE        (101.538),
    .CLKOUT0_DUTY_CYCLE   (0.500),
    .CLKOUT0_USE_FINE_PS  ("FALSE"),
    .CLKIN1_PERIOD        (3.125)
) mmcme4_adv_inst (
    .CLKFBOUT             (clkfbout),
    .CLKOUT0              (clk_out1),
    .CLKFBIN              (clkfbout_buf),
    .CLKIN1               (clk_out_int),
    .CLKIN2               (1'b0),
    .CLKINSEL             (1'b1),
    .DADDR                (7'h0),
    .DCLK                 (1'b0),
    .DEN                  (1'b0),
    .DI                   (16'h0),
    .DWE                  (1'b0),
    .CDDCREQ              (1'b0),
    .PSCLK                (1'b0),
    .PSEN                 (1'b0),
    .PSINCDEC             (1'b0),
    .LOCKED               (locked),
    .PWRDWN               (1'b0),
    .RST                  (1'b0)
);

BUFG clkf_buf (
    .O (clkfbout_buf),
    .I (clkfbout)
);




BUFGCE_DIV #(
  .BUFGCE_DIVIDE(4),         // 1-8
  // Programmable Inversion Attributes: Specifies built-in programmable inversion on specific pins
  .IS_CE_INVERTED(1'b0),     // Optional inversion for CE
  .IS_CLR_INVERTED(1'b0),    // Optional inversion for CLR
  .IS_I_INVERTED(1'b0),      // Optional inversion for I
  .SIM_DEVICE("ULTRASCALE")  // ULTRASCALE
) BUFGCE_DIV_clk_div_i (
  .O(clk_div),     // 1-bit output: Buffer
  .CE(1'b1),   // 1-bit input: Buffer enable
  .CLR(1'b0), // 1-bit input: Asynchronous clear
  .I(clk_out1)      // 1-bit input: Buffer
);

BUFGCE_DIV #(
  .BUFGCE_DIVIDE(1),         // 1-8
  // Programmable Inversion Attributes: Specifies built-in programmable inversion on specific pins
  .IS_CE_INVERTED(1'b0),     // Optional inversion for CE
  .IS_CLR_INVERTED(1'b0),    // Optional inversion for CLR
  .IS_I_INVERTED(1'b0),      // Optional inversion for I
  .SIM_DEVICE("ULTRASCALE")  // ULTRASCALE
) BUFGCE_DIV_clk_i (
  .O(clk),     // 1-bit output: Buffer
  .CE(1'b1),   // 1-bit input: Buffer enable
  .CLR(1'b0), // 1-bit input: Asynchronous clear
  .I(clk_out1)      // 1-bit input: Buffer
);

(* DONT_TOUCH = "yes" *)
BUFG BUFG_clk_div_buf_i (
    .O(clk_div_buf),
    .I(clk_div)
);

endmodule
`default_nettype wire