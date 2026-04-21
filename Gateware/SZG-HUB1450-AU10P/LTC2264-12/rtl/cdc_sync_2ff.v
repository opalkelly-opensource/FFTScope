// 2-flop CDC synchronizer (single-bit level signal, no reset)
module cdc_sync_2ff (
    input  wire clk_dst,
    input  wire async_in,
    output wire sync_out
);

    (* ASYNC_REG = "TRUE" *) reg ff1;
    (* ASYNC_REG = "TRUE" *) reg ff2;

    always @(posedge clk_dst) begin
        ff1 <= async_in;
        ff2 <= ff1;
    end

    assign sync_out = ff2;

endmodule
