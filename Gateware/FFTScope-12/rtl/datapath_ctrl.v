// Copyright (c) 2024-2026 Opal Kelly Incorporated
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.
//
// Register map (base 0x0000, 32-bit registers, byte addresses):
//   0x00 CTRL       W1P  [0]=arm (reads 0)
//   0x04 STATUS     R    [0]=capture_done  [6]=play_ready
//                        [1] adc_rdy and [2] fifo_overflow are in the syzygy_adc
//                        CSR at 0x2000, [5] dac_ready in the syzygy_dac CSR at
//                        0x1000. [4:3] have no producer and read 0.
//   0x08 CONFIG     RW   [0]=dac_enable  [1]=path_sel (0=time, 1=freq)
//   0x0C READ_COUNT R    [31:0]
//
// Reset is active-low. All registers are in the aclk domain (156.25 MHz).
//
// There is no WSTRB. The FrontPanel FX4 host's AXI4-Lite master does not source
// one, and the axi_crossbar in front of this slave ties the lanes to 4'hF on its
// behalf, so CTRL's write-1-pulse fires on the data bit alone.
`default_nettype none

module datapath_ctrl #(
    parameter integer C_ADDR_WIDTH = 12        // 4 KB segment; only [4:2] decoded
) (
    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 aclk CLK" *)
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF S_AXI, ASSOCIATED_RESET aresetn, FREQ_HZ 156250000" *)
    input  wire                       aclk,
    (* X_INTERFACE_INFO = "xilinx.com:signal:reset:1.0 aresetn RST" *)
    (* X_INTERFACE_PARAMETER = "POLARITY ACTIVE_LOW" *)
    input  wire                       aresetn,

    (* X_INTERFACE_PARAMETER = "PROTOCOL AXI4LITE" *)
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI AWADDR" *)
    input  wire [C_ADDR_WIDTH-1:0] s_axi_awaddr,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI AWPROT" *)
    input  wire [2:0]              s_axi_awprot,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI AWVALID" *)
    input  wire                    s_axi_awvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI AWREADY" *)
    output wire                    s_axi_awready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI WDATA" *)
    input  wire [31:0]             s_axi_wdata,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI WVALID" *)
    input  wire                    s_axi_wvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI WREADY" *)
    output wire                    s_axi_wready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI BRESP" *)
    output wire [1:0]              s_axi_bresp,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI BVALID" *)
    output wire                    s_axi_bvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI BREADY" *)
    input  wire                    s_axi_bready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI ARADDR" *)
    input  wire [C_ADDR_WIDTH-1:0] s_axi_araddr,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI ARPROT" *)
    input  wire [2:0]              s_axi_arprot,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI ARVALID" *)
    input  wire                    s_axi_arvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI ARREADY" *)
    output wire                    s_axi_arready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI RDATA" *)
    output wire [31:0]             s_axi_rdata,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI RRESP" *)
    output wire [1:0]              s_axi_rresp,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI RVALID" *)
    output wire                    s_axi_rvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 S_AXI RREADY" *)
    input  wire                    s_axi_rready,

    // CTRL (0x00), one-cycle strobe in the aclk domain
    output wire        ctrl_arm,          // [0] -> adc_capbuf + both fft_capbufs

    // CONFIG (0x08) live control bits
    output wire        cfg_dac_enable,    // [0] -> dac_playbuf.play_enable
    output wire        cfg_path_sel,      // [1] 0=time / 1=freq -> readback_mux

    // STATUS (0x04) producer inputs
    input  wire        st_capture_done,   // [0] <- fft_capbuf_ch1.frame_loaded
    input  wire        st_play_ready,     // [6] <- dac_playbuf.frame_loaded

    // READ_COUNT (0x0C) producer input
    input  wire [31:0] read_count         // <- readback_mux
);

    localparam [1:0] RESP_OKAY = 2'b00;

    // Register byte offsets -> word index (decoded on addr[4:2])
    localparam [2:0] IDX_CTRL       = 3'd0;  // 0x00
    localparam [2:0] IDX_STATUS     = 3'd1;  // 0x04
    localparam [2:0] IDX_CONFIG     = 3'd2;  // 0x08
    localparam [2:0] IDX_READ_COUNT = 3'd3;  // 0x0C

    reg  [1:0]  config_reg;   // [1]=path_sel, [0]=dac_enable
    reg         arm_pulse;

    assign cfg_dac_enable = config_reg[0];
    assign cfg_path_sel   = config_reg[1];
    assign ctrl_arm       = arm_pulse;

    wire [31:0] status_val     = {25'd0, st_play_ready, 5'd0, st_capture_done};
    wire [31:0] config_val     = {30'd0, config_reg};

    // Write channel
    reg        awready_r, wready_r, bvalid_r;
    reg [C_ADDR_WIDTH-1:0] awaddr_r;

    wire write_addr_hs = s_axi_awvalid & ~awready_r;
    wire do_write = wready_r & s_axi_wvalid;

    assign s_axi_awready = awready_r;
    assign s_axi_wready  = wready_r;
    assign s_axi_bvalid  = bvalid_r;
    assign s_axi_bresp   = RESP_OKAY;

    always @(posedge aclk) begin
        if (!aresetn) begin
            awready_r       <= 1'b0;
            wready_r        <= 1'b0;
            bvalid_r        <= 1'b0;
            awaddr_r        <= {C_ADDR_WIDTH{1'b0}};
            config_reg        <= 2'd0;
            arm_pulse         <= 1'b0;
        end else begin
            // strobes are single-cycle
            arm_pulse         <= 1'b0;

            if (write_addr_hs) begin
                awready_r <= 1'b1;
                wready_r  <= 1'b1;
                awaddr_r  <= s_axi_awaddr;
            end else if (do_write) begin
                awready_r <= 1'b0;
                wready_r  <= 1'b0;
            end

            if (do_write) begin
                case (awaddr_r[4:2])
                    IDX_CTRL:   arm_pulse  <= s_axi_wdata[0];
                    IDX_CONFIG: config_reg <= s_axi_wdata[1:0];
                    default: ; // STATUS/READ_COUNT are read-only
                endcase
                bvalid_r <= 1'b1;
            end else if (s_axi_bready & bvalid_r) begin
                bvalid_r <= 1'b0;
            end
        end
    end

    // Read channel
    reg        arready_r, rvalid_r;
    reg [31:0] rdata_r;

    assign s_axi_arready = arready_r;
    assign s_axi_rvalid  = rvalid_r;
    assign s_axi_rdata   = rdata_r;
    assign s_axi_rresp   = RESP_OKAY;

    always @(posedge aclk) begin
        if (!aresetn) begin
            arready_r <= 1'b0;
            rvalid_r  <= 1'b0;
            rdata_r   <= 32'd0;
        end else begin
            if (s_axi_arvalid & ~arready_r & ~rvalid_r) begin
                arready_r <= 1'b1;
                case (s_axi_araddr[4:2])
                    IDX_CTRL:       rdata_r <= 32'd0;        // W1P reads back 0
                    IDX_STATUS:     rdata_r <= status_val;
                    IDX_CONFIG:     rdata_r <= config_val;
                    IDX_READ_COUNT: rdata_r <= read_count;
                    default:        rdata_r <= 32'd0;
                endcase
                rvalid_r  <= 1'b1;
            end else begin
                arready_r <= 1'b0;
                if (rvalid_r & s_axi_rready)
                    rvalid_r <= 1'b0;
            end
        end
    end

endmodule

`default_nettype wire
