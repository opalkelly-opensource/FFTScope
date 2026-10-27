// Copyright (c) 2024-2026 Opal Kelly Incorporated
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.
//
// Per-channel frequency-domain frame buffer. Stores one forward-FFT output frame
// (DEPTH 32-bit bins {XK_IM[15:0], XK_RE[15:0]}) and emits it once per
// acquisition.
//
// Readback is [header][bin 0 .. bin DEPTH-1]. Beat 0 is {27'b0, blk_exp[4:0]},
// the BFP block exponent latched from the frame's TUSER. Beats 1..DEPTH are the
// bins. The host scales the bins by 2^blk_exp.
//
// arm clears frame_loaded and the reader, so frame_loaded rises only once this
// acquisition's FFT has refilled the buffer.
`default_nettype none

module fd_capbuf #(
    parameter integer DEPTH = 2048
) (
    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 aclk CLK" *)
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF S_AXIS:M_AXIS, ASSOCIATED_RESET aresetn, FREQ_HZ 156250000" *)
    input  wire        aclk,
    (* X_INTERFACE_INFO = "xilinx.com:signal:reset:1.0 aresetn RST" *)
    (* X_INTERFACE_PARAMETER = "POLARITY ACTIVE_LOW" *)
    input  wire        aresetn,

    input  wire        arm,            // CTRL.arm, 1-cycle strobe

    // ---- AXIS slave: single-channel forward-FFT output {XK_IM, XK_RE} + TUSER ----
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TVALID" *)
    input  wire        s_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TREADY" *)
    output wire        s_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TDATA" *)
    input  wire [31:0] s_axis_tdata,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TUSER" *)
    input  wire [7:0]  s_axis_tuser,   // [4:0] = BFP block exponent (constant per frame)
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TLAST" *)
    input  wire        s_axis_tlast,

    // ---- AXIS master: header beat, then bins (-> axis_combiner / okPipeOut) ----
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TVALID" *)
    output wire        m_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TREADY" *)
    input  wire        m_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TDATA" *)
    output wire [31:0] m_axis_tdata,

    output wire        frame_loaded,   // -> STATUS.capture_done
    output wire [31:0] read_count      // 32-bit beats: 1 header + DEPTH bins
);
    localparam integer ADDR_W     = $clog2(DEPTH);
    // The egress combiner is 1:1 in beats, so this is also the host's beat count.
    localparam [31:0]  READ_BEATS = DEPTH[31:0] + 32'd1;

    (* ram_style = "block" *) reg [31:0] mem [0:DEPTH-1];

    // Write side: fill one frame, latch the block exponent, raise frame_loaded.
    reg [ADDR_W-1:0] wr_addr;
    reg              loaded_r;
    reg [4:0]        exp_r;

    assign s_axis_tready = 1'b1;                    // the FFT paces this stream
    wire wr_fire = s_axis_tvalid & s_axis_tready;

    always @(posedge aclk) begin
        if (wr_fire) mem[wr_addr] <= s_axis_tdata;
    end

    always @(posedge aclk) begin
        if (!aresetn) begin
            wr_addr  <= {ADDR_W{1'b0}};
            loaded_r <= 1'b0;
            exp_r    <= 5'd0;
        end else if (arm) begin
            wr_addr  <= {ADDR_W{1'b0}};             // new acquisition: invalidate frame
            loaded_r <= 1'b0;
        end else if (wr_fire) begin
            exp_r <= s_axis_tuser[4:0];             // constant per frame; holds by TLAST
            if (s_axis_tlast) begin
                wr_addr  <= {ADDR_W{1'b0}};
                loaded_r <= 1'b1;                    // frame complete -> capture_done
            end else begin
                wr_addr  <= wr_addr + 1'b1;
            end
        end
    end

    // Read side: R_IDLE -> R_HDR (1 beat) -> R_DATA (DEPTH bins) -> R_IDLE
    localparam [1:0] R_IDLE = 2'd0, R_HDR = 2'd1, R_DATA = 2'd2;
    reg [1:0]        rstate;
    reg [ADDR_W:0]   raddr;
    reg [ADDR_W:0]   q_idx;
    reg [31:0]       ram_q;
    reg              q_v;
    reg              loaded_d;

    wire out_fire  = m_axis_tvalid & m_axis_tready;
    wire new_frame = loaded_r & ~loaded_d;          // rising edge: a frame just landed
    wire can_fetch = (rstate == R_DATA) & (raddr < DEPTH) & (~q_v | out_fire);

    always @(posedge aclk) begin
        if (!aresetn) begin
            rstate   <= R_IDLE;
            raddr    <= {(ADDR_W+1){1'b0}};
            q_v      <= 1'b0;
            q_idx    <= {(ADDR_W+1){1'b0}};
            loaded_d <= 1'b0;
        end else if (arm) begin
            rstate   <= R_IDLE;                      // drop any in-flight readback
            raddr    <= {(ADDR_W+1){1'b0}};
            q_idx    <= {(ADDR_W+1){1'b0}};
            q_v      <= 1'b0;
            loaded_d <= 1'b0;
        end else begin
            loaded_d <= loaded_r;
            case (rstate)
                R_IDLE: if (new_frame) begin         // offer the freshly-loaded frame once
                    rstate <= R_HDR;
                    raddr  <= {(ADDR_W+1){1'b0}};
                    q_idx  <= {(ADDR_W+1){1'b0}};
                    q_v    <= 1'b0;
                end
                R_HDR: if (out_fire) rstate <= R_DATA;   // header beat consumed
                R_DATA: begin
                    if (out_fire) q_v <= 1'b0;
                    if (can_fetch) begin
                        ram_q <= mem[raddr[ADDR_W-1:0]];
                        q_idx <= raddr;
                        q_v   <= 1'b1;
                        raddr <= raddr + 1'b1;
                    end
                    if (out_fire && (q_idx == DEPTH-1)) rstate <= R_IDLE;  // last bin done
                end
                default: rstate <= R_IDLE;
            endcase
        end
    end

    assign m_axis_tvalid = (rstate == R_HDR)  ? 1'b1 :
                           (rstate == R_DATA) ? q_v  : 1'b0;
    assign m_axis_tdata  = (rstate == R_HDR)  ? {27'b0, exp_r} : ram_q;

    assign frame_loaded  = loaded_r;
    assign read_count    = loaded_r ? READ_BEATS : 32'd0;
endmodule

`default_nettype wire
