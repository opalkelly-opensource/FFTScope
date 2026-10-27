// Copyright (c) 2024-2026 Opal Kelly Incorporated
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.
//
// AXI-Stream playback frame buffer. The write side (s_axis, s_axis_aclk) fills a
// DEPTH-sample frame and raises frame_loaded. The read side (m_axis, m_axis_aclk)
// streams one sample per cycle, looping from sample 0 while play_enable is high
// and emitting zeros otherwise. Single buffer, so a reload drops frame_loaded.
//
// Storage is an inferred simple-dual-port dual-clock block RAM. play_enable and
// frame_loaded cross into the read domain through 2-FF synchronizers.
`default_nettype none

module playbuf #(
    parameter integer DEPTH = 2048
) (
    // ---- Write side: AXIS slave on s_axis_aclk (one frame in) ----
    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 s_axis_aclk CLK" *)
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF S_AXIS, ASSOCIATED_RESET s_axis_aresetn, FREQ_HZ 156250000" *)
    input  wire               s_axis_aclk,
    (* X_INTERFACE_INFO = "xilinx.com:signal:reset:1.0 s_axis_aresetn RST" *)
    (* X_INTERFACE_PARAMETER = "POLARITY ACTIVE_LOW" *)
    input  wire               s_axis_aresetn,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TVALID" *)
    input  wire               s_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TREADY" *)
    output wire               s_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TDATA" *)
    input  wire [31:0]        s_axis_tdata,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TLAST" *)
    input  wire               s_axis_tlast,

    output wire               frame_loaded,   // -> STATUS.play_ready

    // ---- Read side: AXIS master on m_axis_aclk ----
    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 m_axis_aclk CLK" *)
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF M_AXIS, ASSOCIATED_RESET m_axis_aresetn, FREQ_HZ 156250000" *)
    input  wire               m_axis_aclk,
    (* X_INTERFACE_INFO = "xilinx.com:signal:reset:1.0 m_axis_aresetn RST" *)
    (* X_INTERFACE_PARAMETER = "POLARITY ACTIVE_LOW" *)
    input  wire               m_axis_aresetn,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TVALID" *)
    output wire               m_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TREADY" *)
    input  wire               m_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TDATA" *)
    output wire [31:0]        m_axis_tdata,

    input  wire               play_enable     // CONFIG.dac_enable
);
    localparam integer ADDR_W = $clog2(DEPTH);

    (* ram_style = "block" *) reg [31:0] mem [0:DEPTH-1];

    // Write side (s_axis_aclk): overwrite in place. A frame is DEPTH samples
    // ending in TLAST.
    reg [ADDR_W-1:0] wr_addr;
    reg              in_frame;
    reg              frame_loaded_r;

    assign s_axis_tready = 1'b1;                 // the IFFT paces this stream
    assign frame_loaded  = frame_loaded_r;

    wire wr_en = s_axis_tvalid & s_axis_tready;

    always @(posedge s_axis_aclk) begin
        if (wr_en) mem[wr_addr] <= s_axis_tdata;
    end

    always @(posedge s_axis_aclk) begin
        if (!s_axis_aresetn) begin
            wr_addr        <= {ADDR_W{1'b0}};
            in_frame       <= 1'b0;
            frame_loaded_r <= 1'b0;
        end else if (wr_en) begin
            if (!in_frame) frame_loaded_r <= 1'b0;   // a new frame is starting
            if (s_axis_tlast) begin
                wr_addr        <= {ADDR_W{1'b0}};
                in_frame       <= 1'b0;
                frame_loaded_r <= 1'b1;              // frame complete -> play_ready
            end else begin
                wr_addr  <= wr_addr + 1'b1;
                in_frame <= 1'b1;
            end
        end
    end

    // Slow control levels into the m_axis_aclk domain.
    reg [1:0] pen_sync, frdy_sync;
    always @(posedge m_axis_aclk) begin
        if (!m_axis_aresetn) begin
            pen_sync  <= 2'b00;
            frdy_sync <= 2'b00;
        end else begin
            pen_sync  <= {pen_sync[0],  play_enable};
            frdy_sync <= {frdy_sync[0], frame_loaded_r};
        end
    end
    wire play_active = pen_sync[1] & frdy_sync[1];

    // Read side (m_axis_aclk): free-running loop player. BRAM read latency is one
    // cycle, so the active flag is delayed one cycle to align with the read data.
    reg [ADDR_W-1:0] rd_addr;
    reg [31:0] rd_q;
    reg              active_d;

    always @(posedge m_axis_aclk) begin
        if (!m_axis_aresetn) begin
            rd_addr  <= {ADDR_W{1'b0}};
            active_d <= 1'b0;
        end else if (m_axis_tready) begin
            if (play_active) begin
                rd_addr <= (rd_addr == DEPTH-1) ? {ADDR_W{1'b0}} : rd_addr + 1'b1;
            end else begin
                rd_addr <= {ADDR_W{1'b0}};
            end
            active_d <= play_active;
        end
    end

    always @(posedge m_axis_aclk) begin
        if (m_axis_tready) rd_q <= mem[rd_addr];
    end

    assign m_axis_tdata  = active_d ? rd_q : {32{1'b0}};   // zeros when idle
    assign m_axis_tvalid = m_axis_aresetn;                 // a gap here is a syzygy_dac fifo_underflow

endmodule

`default_nettype wire
