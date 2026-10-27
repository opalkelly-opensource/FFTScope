// Copyright (c) 2024-2026 Opal Kelly Incorporated
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.
//
// Armed time-domain capture buffer. On arm it stores DEPTH contiguous beats of
// the free-running ADC stream, then replays the frame once on each of two
// independent readers: m_axis to the host, m_axis_fft to the forward FFT. A
// re-read needs a fresh arm.
//
// Between captures s_axis_tready is low and the ADC stream is dropped, so the
// syzygy_adc FIFO may overflow. That is expected, not an error.
//
// Single clock: syzygy_adc crosses ADC to aclk internally, and the FrontPanel
// s_axis upstream is aclk.
`default_nettype none

module td_capbuf #(
    parameter integer DEPTH  = 2048
) (
    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 aclk CLK" *)
    (* X_INTERFACE_PARAMETER = "ASSOCIATED_BUSIF S_AXIS:M_AXIS_TIME:M_AXIS_FFT, ASSOCIATED_RESET aresetn, FREQ_HZ 156250000" *)
    input  wire               aclk,
    (* X_INTERFACE_INFO = "xilinx.com:signal:reset:1.0 aresetn RST" *)
    (* X_INTERFACE_PARAMETER = "POLARITY ACTIVE_LOW" *)
    input  wire               aresetn,

    input  wire               arm,            // CTRL.arm, 1-cycle strobe

    // ---- AXIS slave: ADC stream in {ch2,ch1} ----
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TVALID" *)
    input  wire               s_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TREADY" *)
    output wire               s_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TDATA" *)
    input  wire [31:0]        s_axis_tdata,

    // ---- AXIS master B: host readback (-> width-convert -> readback_mux time) ----
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS_TIME TVALID" *)
    output wire               m_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS_TIME TREADY" *)
    input  wire               m_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS_TIME TDATA" *)
    output wire [31:0]        m_axis_tdata,

    // ---- AXIS master A: auto-replay to the forward FFT ----
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS_FFT TVALID" *)
    output wire               m_axis_fft_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS_FFT TREADY" *)
    input  wire               m_axis_fft_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS_FFT TDATA" *)
    output wire [31:0]        m_axis_fft_tdata,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS_FFT TLAST" *)
    output wire               m_axis_fft_tlast,

    output wire [31:0]        read_count      // 64-bit beats the host reads
);
    localparam integer ADDR_W     = $clog2(DEPTH);
    // The host reads the frame as 64-bit beats: two 32-bit samples per beat.
    localparam [31:0]  READ_BEATS = (DEPTH * 32) / 64;

    // Two copies of the frame: an inferred block RAM offers one read port, and
    // the FFT replay and the host readback each need their own.
    (* ram_style = "block" *) reg [31:0] mem_a [0:DEPTH-1];  // -> FFT replay
    (* ram_style = "block" *) reg [31:0] mem_b [0:DEPTH-1];  // -> host readback

    // Capture: fill both copies in lockstep.
    reg              capturing;
    reg              captured;
    reg [ADDR_W-1:0] wr_addr;

    assign s_axis_tready = capturing;
    wire   wr_fire       = capturing & s_axis_tvalid;

    always @(posedge aclk) begin
        if (wr_fire) begin
            mem_a[wr_addr] <= s_axis_tdata;
            mem_b[wr_addr] <= s_axis_tdata;
        end
    end

    always @(posedge aclk) begin
        if (!aresetn) begin
            capturing <= 1'b0;
            captured  <= 1'b0;
            wr_addr   <= {ADDR_W{1'b0}};
        end else if (arm) begin
            capturing <= 1'b1;
            captured  <= 1'b0;
            wr_addr   <= {ADDR_W{1'b0}};
        end else if (wr_fire) begin
            if (wr_addr == DEPTH-1) begin
                capturing <= 1'b0;
                captured  <= 1'b1;
                wr_addr   <= {ADDR_W{1'b0}};
            end else begin
                wr_addr <= wr_addr + 1'b1;
            end
        end
    end

    // Port B reader: host readback.
    reg              go_b;
    reg [ADDR_W:0]   raddr_b;
    reg [31:0] ram_qb;
    reg              q_vb;

    wire out_fire_b  = m_axis_tvalid & m_axis_tready;
    wire can_fetch_b = go_b & (raddr_b < DEPTH) & (~q_vb | out_fire_b);

    always @(posedge aclk) begin
        if (!aresetn) begin
            go_b    <= 1'b0;
            raddr_b <= {(ADDR_W+1){1'b0}};
            q_vb    <= 1'b0;
        end else if (arm) begin
            go_b    <= 1'b0;
            raddr_b <= {(ADDR_W+1){1'b0}};
            q_vb    <= 1'b0;
        end else begin
            if (captured & ~go_b) begin              // freshly captured -> offer once
                go_b    <= 1'b1;
                raddr_b <= {(ADDR_W+1){1'b0}};
                q_vb    <= 1'b0;
            end
            if (out_fire_b) q_vb <= 1'b0;
            if (can_fetch_b) begin
                ram_qb  <= mem_b[raddr_b[ADDR_W-1:0]];
                q_vb    <= 1'b1;
                raddr_b <= raddr_b + 1'b1;
            end
        end
    end

    assign m_axis_tvalid = q_vb;
    assign m_axis_tdata  = ram_qb;

    // Port A reader: auto-replay into the forward FFT.
    reg              go_a;
    reg [ADDR_W:0]   raddr_a;
    reg [ADDR_W:0]   q_idx_a;
    reg [31:0] ram_qa;
    reg              q_va;

    wire out_fire_a  = m_axis_fft_tvalid & m_axis_fft_tready;
    wire can_fetch_a = go_a & (raddr_a < DEPTH) & (~q_va | out_fire_a);

    always @(posedge aclk) begin
        if (!aresetn) begin
            go_a    <= 1'b0;
            raddr_a <= {(ADDR_W+1){1'b0}};
            q_va    <= 1'b0;
            q_idx_a <= {(ADDR_W+1){1'b0}};
        end else if (arm) begin
            go_a    <= 1'b0;
            raddr_a <= {(ADDR_W+1){1'b0}};
            q_va    <= 1'b0;
        end else begin
            if (captured & ~go_a) begin              // freshly captured -> auto-replay once
                go_a    <= 1'b1;
                raddr_a <= {(ADDR_W+1){1'b0}};
                q_va    <= 1'b0;
            end
            if (out_fire_a) q_va <= 1'b0;
            if (can_fetch_a) begin
                ram_qa  <= mem_a[raddr_a[ADDR_W-1:0]];
                q_idx_a <= raddr_a;
                q_va    <= 1'b1;
                raddr_a <= raddr_a + 1'b1;
            end
        end
    end

    assign m_axis_fft_tvalid = q_va;
    assign m_axis_fft_tdata  = ram_qa;
    assign m_axis_fft_tlast  = (q_idx_a == DEPTH-1);

    assign read_count   = captured ? READ_BEATS : 32'd0;
endmodule

`default_nettype wire
