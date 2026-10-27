# Copyright (c) 2024-2026 Opal Kelly Incorporated
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.
#
# FFTScopev2 gateware, 12-bit variant: SZG-ADC-LTC2264-12 on PORT B at 40 MSPS.
# The 14-bit variant is ../FFTScope-14. The two differ only in the ADC encode
# frequency, CONFIG.ADC_VARIANT, the adc_dco create_clock period in the XDC, and
# top_name.
#
# Run:  vivado -mode batch -source project.tcl
#   FFTSCOPE_OUT=<dir>  build into a scratch dir instead of ./vivado
#
# Required IP cores, copied into ./IP (see IP/README.txt):
#   FrontPanel Vivado IP distribution  v1.1.0 or later (frontpanel core; numeric
#                                      FX4.MODE)
#   SYZYGY DAC IP (syzygy_dac)         any release; newer releases stay backwards
#   SYZYGY ADC IP (syzygy_adc)         compatible, so no version is pinned below
#   Board files                        SZG-HUB1450-AU10P-10G

set proj    fftscope
set part    xcau10p-ffvb676-1-e
set board   {SZG-HUB1450-AU10P-10G}
set fx4mode {3}

set here    [file normalize [file dirname [info script]]]
set rtl_dir [file join $here rtl]
set xdc_dir [file join $here constraints]
set ip_dir  [file join $here IP]

if {[info exists ::env(FFTSCOPE_OUT)] && $::env(FFTSCOPE_OUT) ne ""} {
    set out_dir [file normalize $::env(FFTSCOPE_OUT)]
} else {
    set out_dir [file join $here vivado]
}

# Check IP folder
if {[llength [glob -nocomplain -directory $ip_dir -types d *]] == 0} {
    puts "ERROR: no IP cores found in the 'IP' directory of this project."
    puts "Please ensure the following structure exists:"
    puts "    ./IP/FrontPanel-Vivado-IP-Dist-v1.1.0/"
    puts "    ./IP/syzygy-adc/"
    puts "    ./IP/syzygy-dac/"
    puts ""
    puts "You can find these in the FrontPanel Vivado IP distribution and the"
    puts "design-resources Syzygy-IP folder. See IP/README.txt."
    error "Missing IP cores."
}

# Project
create_project $proj $out_dir -part $part -force

# Vivado scans ./IP recursively, so the cores can sit at any depth under it.
set_property ip_repo_paths $ip_dir [current_project]
update_ip_catalog

# Match by name only, so any release of each core is accepted.
foreach vlnv {opalkelly.com:ip:frontpanel xilinx.com:user:syzygy_dac xilinx.com:user:syzygy_adc} {
    if {[llength [get_ipdefs -all -filter "VLNV =~ $vlnv:*"]] == 0} {
        error "IP core $vlnv not found under $ip_dir. See IP/README.txt."
    }
}

add_files -norecurse [list \
    [file join $rtl_dir datapath_ctrl.v] \
    [file join $rtl_dir playbuf.v] \
    [file join $rtl_dir fft_cfg.v] \
    [file join $rtl_dir td_capbuf.v] \
    [file join $rtl_dir fd_capbuf.v] \
    [file join $rtl_dir readback_mux.v] \
]
add_files -fileset constrs_1 -norecurse [file join $xdc_dir fftscope.xdc]
update_compile_order -fileset sources_1

# Block design
set bd fftscope_bd
create_bd_design $bd

# --- FrontPanel FX4 host (AXI mode) ---
# FX4.MODE is the bandwidth mode number. Mode 3 gives a 64-bit upstream S_AXIS, a
# 32-bit downstream M_AXIS and a 156.25 MHz aclk. SZG-HUB1450-AU10P-10G offers
# modes 3 and 4. The AXI4-Full master is unused in this design and left unconnected.
set fp [create_bd_cell -type ip -vlnv opalkelly.com:ip:frontpanel FrontPanel]
set_property -dict [list \
    CONFIG.BOARD    $board \
    CONFIG.FX4.MODE $fx4mode \
] $fp

# --- Datapath control: primary AXIL slave at 0x0000 ---
create_bd_cell -type module -reference datapath_ctrl datapath_ctrl

# --- AXI4-Lite crossbar: FX4 M_AXIL -> M00 = datapath_ctrl, M01 = syzygy_dac,
#     M02 = syzygy_adc ---
set xbar [create_bd_cell -type ip -vlnv xilinx.com:ip:axi_crossbar axi_crossbar]
set_property -dict [list \
    CONFIG.PROTOCOL          {AXI4LITE} \
    CONFIG.NUM_SI            {1} \
    CONFIG.NUM_MI            {3} \
    CONFIG.CONNECTIVITY_MODE {SASD} \
] $xbar

# --- Reset bridge off aclk ---
set rst [create_bd_cell -type ip -vlnv xilinx.com:ip:proc_sys_reset proc_sys_reset]

# Connections
# -name, because make_bd_intf_pins_external otherwise appends the cell index and
# the external port comes out "host_interface_0". The szg_dac / szg_adc calls
# below pass one for the same reason.
make_bd_intf_pins_external -name host_interface [get_bd_intf_pins FrontPanel/host_interface]

connect_bd_net [get_bd_pins FrontPanel/aclk] \
    [get_bd_pins datapath_ctrl/aclk] \
    [get_bd_pins axi_crossbar/aclk] \
    [get_bd_pins proc_sys_reset/slowest_sync_clk]

# Reset: IP's axil_aresetn -> proc_sys_reset -> datapath_ctrl + crossbar peripheral reset
connect_bd_net [get_bd_pins FrontPanel/axil_aresetn] [get_bd_pins proc_sys_reset/ext_reset_in]
connect_bd_net [get_bd_pins proc_sys_reset/peripheral_aresetn] \
    [get_bd_pins datapath_ctrl/aresetn] \
    [get_bd_pins axi_crossbar/aresetn]

connect_bd_intf_net [get_bd_intf_pins FrontPanel/M_AXIL]   [get_bd_intf_pins axi_crossbar/S00_AXI]
connect_bd_intf_net [get_bd_intf_pins axi_crossbar/M00_AXI] [get_bd_intf_pins datapath_ctrl/S_AXI]

# =============================================================================
# DAC playback path
#   FrontPanel/M_AXIS (32b,TLAST) -> xfft(inv) -> dac_convert -> dac_playbuf ->
#   syzygy_dac -> PORT A pod.
# =============================================================================

# --- Sample clock: aclk 156.25 MHz -> dac_sample_clk 125 MHz ---
# CLKOUT1 feeds only syzygy_dac/dac_sample_clk (the IP's internal DDR domain);
# the AXIS path and playbuf run on aclk. 125 MHz is the AD9116 max rate, and a
# dedicated single-output wizard hits it exactly from 156.25: VCO 1000 =
# 156.25 x 32 / 5, then /8. An inexact divide rounds and trips BD 41-238 FREQ_HZ
# equality. The syzygy_dac dac_sample_clk FREQ_HZ and the software
# DAC_SAMPLE_CLK constant must match this value.
set clkw [create_bd_cell -type ip -vlnv xilinx.com:ip:clk_wiz clk_wiz_dac]
set_property -dict [list \
    CONFIG.PRIM_IN_FREQ                {156.25} \
    CONFIG.CLKOUT1_REQUESTED_OUT_FREQ  {125.000} \
    CONFIG.USE_LOCKED                  {true} \
    CONFIG.USE_RESET                   {false} \
] $clkw

# --- Inverse FFT: dual-channel via real/imag, radix-2 lite burst I/O, unscaled ---
# The host streams the whole complex spectrum as one frame and the IFFT
# reconstructs 2048 complex time samples, which dac_playbuf loops out the DAC.
# Unscaled means full bit growth: the output reaches input_width + log2(N) + 1 =
# 16 + 11 + 1 = 28 bits, sign-extended to 32 per component, so M_AXIS_DATA is
# 64-bit {XK_IM, XK_RE} and the transform cannot overflow internally. The IFFT is
# linear, so a host spectrum built as FFT(a + j*b) reconstructs waveform a on the
# real output and waveform b on the imaginary.
set fft [create_bd_cell -type ip -vlnv xilinx.com:ip:xfft xfft_inv]
set_property -dict [list \
    CONFIG.transform_length                    {2048} \
    CONFIG.implementation_options              {radix_2_lite_burst_io} \
    CONFIG.run_time_configurable_transform_length {false} \
    CONFIG.channels                            {1} \
    CONFIG.data_format                         {fixed_point} \
    CONFIG.input_width                         {16} \
    CONFIG.phase_factor_width                  {16} \
    CONFIG.scaling_options                     {unscaled} \
    CONFIG.output_ordering                     {natural_order} \
    CONFIG.throttle_scheme                     {nonrealtime} \
    CONFIG.aclken                              {false} \
    CONFIG.aresetn                             {true} \
] $fft

# Config word = FWD_INV = 0 (inverse). Unscaled carries no scaling schedule, so
# S_AXIS_CONFIG is just the 1-byte direction word. W is derived from the
# configured core, so a width mismatch is a connect/validate error.
set fftc [create_bd_cell -type module -reference fft_cfg fft_cfg_inv]
set cfgw [expr {[get_property CONFIG.TDATA_NUM_BYTES [get_bd_intf_pins xfft_inv/S_AXIS_CONFIG]] * 8}]
set_property -dict [list CONFIG.W $cfgw CONFIG.VAL 0] $fftc

# --- Complex IFFT bins -> packed dual-channel DAC word: stock axis_subset_converter ---
# Input is the 64-bit IFFT output: XK_RE = tdata[31:0], XK_IM = tdata[63:32].
# This packs both 16-bit reconstruction windows into one 32-bit DAC beat, one
# 12-bit channel per half-word, MSB-aligned: channel I = XK_RE[15:4] ->
# tdata[31:20], channel Q = XK_IM[15:4] -> tdata[15:4], so the remap selects
# tdata[15:4] then tdata[47:36]. syzygy_dac splits [31:20] to I and [15:4] to Q
# on the AD9116's two DACs. Samples stay signed two's complement here.
#
# The >>4 is a pure bit-select with no saturation, so a sample outside the window
# wraps instead of clipping. Host autoscale keeps each summed spectrum inside it.
set dacconv [create_bd_cell -type ip -vlnv xilinx.com:ip:axis_subset_converter dac_convert]
# No HAS_TLAST param on this IP: it propagates TLAST/TKEEP/TSTRB from the slave.
set_property -dict [list \
    CONFIG.S_TDATA_NUM_BYTES {8} \
    CONFIG.M_TDATA_NUM_BYTES {4} \
    CONFIG.TDATA_REMAP       {tdata[15:4],4'b0,tdata[47:36],4'b0} \
] $dacconv

# --- dac_playbuf: loop player, write and read both on aclk ---
set play [create_bd_cell -type module -reference playbuf dac_playbuf]
set_property -dict [list CONFIG.DEPTH {2048}] $play

# --- SYZYGY DAC (AD911x) ---
# CTRL_INTERFACE 0 = AXI-Lite CSR on crossbar M01. There is no INPUT_FORMAT build
# parameter; setting one raises BD 41-1276. SCLK_DIV is a fixed localparam
# (aclk/202). DAC_FSADJ_I/Q seed the SPI controller's IRSET/QRSET shadow
# defaults, which a DAC soft reset re-applies. Runtime full-scale is a raw write
# into the AD911x direct map (0x40 + 4*N: IRSET 0x50, QRSET 0x5C, as {0x80|code}).
#
# DAC_SAMPLE_FORMAT declares the format of the samples arriving on
# dac_data_stream, and the IP passes it to the AD911x Data Control TWOS bit
# (0x02[7]) at bring-up:
#   0 = unsigned offset binary  (TWOS 0, idle code 0x800)
#   1 = signed two's complement (TWOS 1, idle code 0x000)
# The datapath converts nothing; the device is programmed to match the stream.
# dac_convert emits signed two's complement, so this must be 1. At the IP default
# of 0 the AD9116 would be programmed for offset binary while fed two's
# complement: every sample's MSB reads inverted, giving a half-scale DC offset
# with wrapped rails.
set dac [create_bd_cell -type ip -vlnv xilinx.com:user:syzygy_dac syzygy_dac]
set_property -dict [list \
    CONFIG.DAC_FSADJ_I {32} CONFIG.DAC_FSADJ_Q {32} \
    CONFIG.CTRL_INTERFACE {0} \
    CONFIG.DAC_SAMPLE_FORMAT {1} \
] $dac

# --- Clocks: playback runs on aclk; clk_wiz_dac/clk_out1 is the DAC sample clock ---
connect_bd_net [get_bd_pins FrontPanel/aclk] \
    [get_bd_pins clk_wiz_dac/clk_in1] \
    [get_bd_pins xfft_inv/aclk] \
    [get_bd_pins fft_cfg_inv/aclk] \
    [get_bd_pins dac_convert/aclk] \
    [get_bd_pins dac_playbuf/s_axis_aclk] \
    [get_bd_pins dac_playbuf/m_axis_aclk] \
    [get_bd_pins syzygy_dac/aclk]
connect_bd_net [get_bd_pins clk_wiz_dac/clk_out1] \
    [get_bd_pins syzygy_dac/dac_sample_clk]

# --- Resets: one aclk peripheral reset. The DAC IP synchronizes it into the
#     dac_sample_clk domain itself (async assert). ---
connect_bd_net [get_bd_pins proc_sys_reset/peripheral_aresetn] \
    [get_bd_pins xfft_inv/aresetn] \
    [get_bd_pins fft_cfg_inv/aresetn] \
    [get_bd_pins dac_convert/aresetn] \
    [get_bd_pins dac_playbuf/s_axis_aresetn] \
    [get_bd_pins dac_playbuf/m_axis_aresetn] \
    [get_bd_pins syzygy_dac/aresetn]

# --- Data path ---
connect_bd_intf_net [get_bd_intf_pins FrontPanel/M_AXIS]         [get_bd_intf_pins xfft_inv/S_AXIS_DATA]
connect_bd_intf_net [get_bd_intf_pins fft_cfg_inv/M_AXIS_CONFIG] [get_bd_intf_pins xfft_inv/S_AXIS_CONFIG]
connect_bd_intf_net [get_bd_intf_pins xfft_inv/M_AXIS_DATA]      [get_bd_intf_pins dac_convert/S_AXIS]
connect_bd_intf_net [get_bd_intf_pins dac_convert/M_AXIS]         [get_bd_intf_pins dac_playbuf/S_AXIS]
connect_bd_intf_net [get_bd_intf_pins dac_playbuf/M_AXIS]        [get_bd_intf_pins syzygy_dac/dac_data_stream]

# --- datapath_ctrl wiring: playback ---
connect_bd_net [get_bd_pins datapath_ctrl/cfg_dac_enable] [get_bd_pins dac_playbuf/play_enable]
connect_bd_net [get_bd_pins dac_playbuf/frame_loaded]     [get_bd_pins datapath_ctrl/st_play_ready]
# dac_ready, fifo_underflow, SPI status and the AD911x device-register direct map
# live in the syzygy_dac CSR at 0x1000 rather than on discrete pins.
#
# The SYZYGY IPs' AXI-Lite slave answers to two names: wire it by the interface
# pin s_axi_csr, address it by the memory map dac_csr / adc_csr. The address
# editor displays the map name, which is what makes the pin easy to get wrong.
connect_bd_intf_net [get_bd_intf_pins axi_crossbar/M01_AXI] [get_bd_intf_pins syzygy_dac/s_axi_csr]

# --- DAC pod pins -> external (constrained to PORT A in the XDC) ---
# syzygy_dac groups its 6 pod pins under one bus interface, szg_dac_interface
# (opalkelly.com:interface:szg_dac_ad911x_rtl:1.0), which claims them, so the
# individual pins no longer resolve and the interface is externalized whole. The
# generated wrapper names each leaf <portname>_<logical>: szg_dac_db[11:0],
# szg_dac_clkin, szg_dac_reset_pinmd, szg_dac_sclk, szg_dac_cs_b, and the inout
# szg_dac_sdio. The XDC PACKAGE_PIN rows track these names, matching the SPI inout
# leaf with a szg_dac_sdio* glob in case of an _io suffix.
make_bd_intf_pins_external -name szg_dac [get_bd_intf_pins syzygy_dac/szg_dac_interface]

puts "FFTSCOPE: xfft_inv S_AXIS_CONFIG TDATA width = \
    [get_property CONFIG.TDATA_NUM_BYTES [get_bd_intf_pins xfft_inv/S_AXIS_CONFIG]] bytes; fft_cfg_inv W = $cfgw bits"
puts "FFTSCOPE: xfft_inv M_AXIS_DATA TDATA width = \
    [get_property CONFIG.TDATA_NUM_BYTES [get_bd_intf_pins xfft_inv/M_AXIS_DATA]] bytes (expect 8)"

# =============================================================================
# ADC time-domain capture
#   syzygy_adc (PORT B) -> td_capbuf (armed 2048-sample capture) -> dwidth 32->64
#   -> readback_mux time input.
#
#   The ADC to aclk CDC, the offset-binary to signed conversion and the adc_reset
#   stretch are all internal to syzygy_adc.
# =============================================================================

# --- SYZYGY ADC (LTC2264-12 pod on PORT B) ---
# The IP inverts the offset-binary MSB per channel, so the output stream is always
# signed two's complement and there is no output-format parameter.
set adc [create_bd_cell -type ip -vlnv xilinx.com:user:syzygy_adc syzygy_adc]
# ADC_VARIANT is an enum, 0 = LTC2264-12 and 1 = LTC2268-14, not a bit count; a
# {12} here is rejected with "out of range, valid values are 0, 1". It does not
# change the RTL: the DCO drives BUFGCE_DIV /1 and /4 with no MMCM to tune, and
# the IDELAY eye sweep works in physical taps. What selects the rate is the encode
# clock below (40 MHz -> DCO 160 MHz) and the matching adc_dco create_clock
# (6.250 ns) in the XDC. Set both to the pod.
#
# The capture delay lines run in DELAY_FORMAT COUNT, which needs no IDELAYCTRL, so
# there is no IDELAY_REFCLK_FREQ, no IDELAY_GROUP and no idelay_ref_clk to wire.
# CTRL_INTERFACE 0 = AXI-Lite CSR on crossbar M02.
# ALIGN_MODE is left at the IP default: the core only enables it for the
# LTC2268-14 (ADC_VARIANT 1) and ignores it here.
set_property -dict [list \
    CONFIG.ADC_VARIANT {0} CONFIG.FIFO_DEPTH {2048} \
    CONFIG.CTRL_INTERFACE {0} \
] $adc

# --- ADC encode clock: own clk_wiz off aclk -> 40 MHz, kept separate from
# clk_wiz_dac so the DAC's 125 MHz divide stays exact. syzygy_adc/adc_sample_clk
# takes the encode at the provided rate, and the pod returns DCO = 4x encode =
# 160 MHz, which the IP captures on BUFGCE_DIVs straight off the DCO and
# eye-centres at run time with a shared IDELAYE3 tap.
#
# One output only. An IDELAYCTRL reference clock on a CLKOUT2 would go unused,
# since VT compensation is its only job and COUNT-mode delay lines tie EN_VTC low.
# It would also break the build: an IDELAYCTRL brings a startup BISC that makes
# the DAC's BITSLICE0 unavailable during calibration, raising DRC PDRC-203,
# because ADC and DAC share I/O bank 64. ---
set clkwa [create_bd_cell -type ip -vlnv xilinx.com:ip:clk_wiz clk_wiz_adc]
set_property -dict [list \
    CONFIG.PRIM_IN_FREQ                {156.25} \
    CONFIG.CLKOUT1_REQUESTED_OUT_FREQ  {40.000} \
    CONFIG.USE_LOCKED                  {false} \
    CONFIG.USE_RESET                   {false} \
] $clkwa

# --- Custom RTL: time-domain capture buffer ---
set capbuf [create_bd_cell -type module -reference td_capbuf     adc_capbuf]
set_property -dict [list CONFIG.DEPTH {2048}] $capbuf

# --- 32->64 width converter for the 64-bit FrontPanel s_axis upstream ---
# HAS_TLAST 0 to match the FrontPanel AXIS slave, which has no TLAST. Switching it
# off also drops the master-side TKEEP the upsizer would otherwise emit to mark a
# partial final beat, so the whole readback path is TDATA/TVALID/TREADY only.
#
# That makes td_capbuf's DEPTH being even load-bearing. With no TLAST there is no
# end-of-packet flush, so an odd beat count would strand the last 32-bit sample
# inside the converter and the host would read one beat short. DEPTH is 2048.
set dwc [create_bd_cell -type ip -vlnv xilinx.com:ip:axis_dwidth_converter adc_dwidth]
set_property -dict [list \
    CONFIG.S_TDATA_NUM_BYTES {4} \
    CONFIG.M_TDATA_NUM_BYTES {8} \
    CONFIG.HAS_TLAST {0} \
] $dwc

# --- Clocks: encode (40 MHz) to the ADC sample clock; aclk to the rest ---
connect_bd_net [get_bd_pins FrontPanel/aclk] [get_bd_pins clk_wiz_adc/clk_in1]
connect_bd_net [get_bd_pins clk_wiz_adc/clk_out1] [get_bd_pins syzygy_adc/adc_sample_clk]
connect_bd_net [get_bd_pins FrontPanel/aclk] \
    [get_bd_pins syzygy_adc/aclk] \
    [get_bd_pins adc_capbuf/aclk] \
    [get_bd_pins adc_dwidth/aclk]

# --- Resets: aclk-domain peripheral reset ---
connect_bd_net [get_bd_pins proc_sys_reset/peripheral_aresetn] \
    [get_bd_pins syzygy_adc/aresetn] \
    [get_bd_pins adc_capbuf/aresetn] \
    [get_bd_pins adc_dwidth/aresetn]
# ADC re-align/reset and all health telemetry (adc_ready, capture_clk_alive,
# align_done/fail, align_phase, eye_width, fifo_overflow) live in the syzygy_adc
# CSR at 0x2000 rather than on discrete pins. STATUS[1] is capture_clk_alive,
# that the ADC DCO is toggling. The reset stretch is internal to the IP as well,
# driven by CTRL[0] as a write-1-pulse.
connect_bd_intf_net [get_bd_intf_pins axi_crossbar/M02_AXI] [get_bd_intf_pins syzygy_adc/s_axi_csr]

# --- Capture data path ---
connect_bd_intf_net [get_bd_intf_pins syzygy_adc/adc_data_stream] [get_bd_intf_pins adc_capbuf/S_AXIS]
connect_bd_intf_net [get_bd_intf_pins adc_capbuf/M_AXIS_TIME]          [get_bd_intf_pins adc_dwidth/S_AXIS]
# adc_dwidth/M_AXIS is the S_AXIS_TIME input of readback_mux, wired in the forward-FFT
# section below where the FREQ input joins it.

# --- datapath_ctrl wiring: capture ---
connect_bd_net [get_bd_pins datapath_ctrl/ctrl_arm] [get_bd_pins adc_capbuf/arm]

# --- ADC pod pins -> external (constrained to PORT B in the XDC) ---
# syzygy_adc groups its 14 pod pins (LVDS data/frame/clock lanes plus the 4-wire
# SPI) under one bus interface, szg_adc_interface
# (opalkelly.com:interface:szg_adc_ltc226x_rtl:1.0), externalized whole as above.
# Wrapper leaf names: szg_adc_out1_p[1:0]/out1_n, out2_p/out2_n, fr_p/n, dco_p/n,
# enc_p/n, sclk, sdi, sdo, cs_b. The pod encode lane is the interface's enc_*.
make_bd_intf_pins_external -name szg_adc [get_bd_intf_pins syzygy_adc/szg_adc_interface]

# =============================================================================
# Forward FFT / frequency-domain capture
#   td_capbuf port A -> axis_broadcaster -> 2x xfft(FWD,BFP) -> 2x fd_capbuf ->
#   axis_combiner (64b {ch2_bin, ch1_bin}) -> readback_mux (freq).
#   td_capbuf port B -> adc_dwidth (32->64) -> readback_mux (time).
#   readback_mux (CONFIG.path_sel) -> FrontPanel/S_AXIS. Everything on aclk.
#
#   Two single-channel BFP cores: xfft has no 2-channel TDM plus BFP core. BFP
#   cannot overflow, which is why STATUS[3] has no producer.
# =============================================================================

# --- Forward FFT input fan-out: stock axis_broadcaster (1x32b -> 2x32b) ---
# TDATA_REMAP slices the two channels out of the packed ADC time sample and
# zero-extends the imaginary half so each FFT core sees a complex {16'b0, chN}.
# The ADC IP packs {ch1[31:16], ch2[15:0]}, so M00 = ch1 (high 16b) and
# M01 = ch2 (low 16b).
set fsplit [create_bd_cell -type ip -vlnv xilinx.com:ip:axis_broadcaster ch_split]
set_property -dict [list \
    CONFIG.NUM_MI            {2} \
    CONFIG.S_TDATA_NUM_BYTES {4} \
    CONFIG.M_TDATA_NUM_BYTES {4} \
    CONFIG.M00_TDATA_REMAP   {16'b0,tdata[31:16]} \
    CONFIG.M01_TDATA_REMAP   {16'b0,tdata[15:0]} \
] $fsplit

# --- Two single-channel forward FFTs (BFP) ---
# Same IP config as the inverse core with channels=1, but no fft_cfg driver: these
# run on their built-in default configuration with S_AXIS_CONFIG unconnected. For
# a real input |forward FFT| == |inverse FFT|, so the magnitude the spectrum needs
# is identical whichever direction the default selects. The inverse core keeps its
# fft_cfg because the DAC reconstruction needs the true inverse, not a magnitude.
proc mk_fwd_fft {name} {
    set c [create_bd_cell -type ip -vlnv xilinx.com:ip:xfft $name]
    set_property -dict [list \
        CONFIG.transform_length                       {2048} \
        CONFIG.implementation_options                 {pipelined_streaming_io} \
        CONFIG.run_time_configurable_transform_length {false} \
        CONFIG.channels                               {1} \
        CONFIG.data_format                            {fixed_point} \
        CONFIG.input_width                            {16} \
        CONFIG.phase_factor_width                     {16} \
        CONFIG.scaling_options                        {block_floating_point} \
        CONFIG.rounding_modes                         {convergent_rounding} \
        CONFIG.output_ordering                        {natural_order} \
        CONFIG.throttle_scheme                        {nonrealtime} \
        CONFIG.aclken                                 {false} \
        CONFIG.aresetn                                {true} \
    ] $c
    return $c
}
mk_fwd_fft xfft_fwd_ch1
mk_fwd_fft xfft_fwd_ch2

# --- Per-channel 32b freq buffers; each emits a block-exponent header beat ---
set fdbuf1 [create_bd_cell -type module -reference fd_capbuf fft_capbuf_ch1]
set_property -dict [list CONFIG.DEPTH {2048}] $fdbuf1
set fdbuf2 [create_bd_cell -type module -reference fd_capbuf fft_capbuf_ch2]
set_property -dict [list CONFIG.DEPTH {2048}] $fdbuf2

# --- Combine 2x 32b channel bins -> 64b {ch2_bin, ch1_bin}: stock axis_combiner ---
# S00 = ch1 (low 32b), S01 = ch2 (high 32b). The host depends on that word order.
# HAS_TLAST 0: this is the readback side, and FrontPanel/S_AXIS has no TLAST.
set fcomb [create_bd_cell -type ip -vlnv xilinx.com:ip:axis_combiner ch_combine]
set_property -dict [list \
    CONFIG.NUM_SI          {2} \
    CONFIG.TDATA_NUM_BYTES {4} \
    CONFIG.HAS_TLAST       {0} \
] $fcomb

# --- Dual-source readback select (time vs freq by CONFIG.path_sel) ---
set rbmux [create_bd_cell -type module -reference readback_mux readback_mux]
set_property -dict [list CONFIG.DATA_W {64}] $rbmux

# --- Clocks (all aclk) ---
connect_bd_net [get_bd_pins FrontPanel/aclk] \
    [get_bd_pins ch_split/aclk] \
    [get_bd_pins xfft_fwd_ch1/aclk] \
    [get_bd_pins xfft_fwd_ch2/aclk] \
    [get_bd_pins fft_capbuf_ch1/aclk] \
    [get_bd_pins fft_capbuf_ch2/aclk] \
    [get_bd_pins ch_combine/aclk] \
    [get_bd_pins readback_mux/aclk]

# --- Resets (aclk peripheral reset) ---
connect_bd_net [get_bd_pins proc_sys_reset/peripheral_aresetn] \
    [get_bd_pins ch_split/aresetn] \
    [get_bd_pins xfft_fwd_ch1/aresetn] \
    [get_bd_pins xfft_fwd_ch2/aresetn] \
    [get_bd_pins fft_capbuf_ch1/aresetn] \
    [get_bd_pins fft_capbuf_ch2/aresetn] \
    [get_bd_pins ch_combine/aresetn] \
    [get_bd_pins readback_mux/aresetn]

# --- Forward FFT data path ---
connect_bd_intf_net [get_bd_intf_pins adc_capbuf/M_AXIS_FFT]    [get_bd_intf_pins ch_split/S_AXIS]
connect_bd_intf_net [get_bd_intf_pins ch_split/M00_AXIS]        [get_bd_intf_pins xfft_fwd_ch1/S_AXIS_DATA]
connect_bd_intf_net [get_bd_intf_pins ch_split/M01_AXIS]        [get_bd_intf_pins xfft_fwd_ch2/S_AXIS_DATA]
# S_AXIS_CONFIG is left unconnected on both forward cores (default config). Its
# TVALID is tied low explicitly; IPI would tie it off anyway, with BD 41-759.
set fcfg_tie [create_bd_cell -type ip -vlnv xilinx.com:ip:xlconstant fwd_cfg_tvalid_tie]
set_property -dict [list CONFIG.CONST_WIDTH {1} CONFIG.CONST_VAL {0}] $fcfg_tie
connect_bd_net [get_bd_pins fwd_cfg_tvalid_tie/dout] \
    [get_bd_pins xfft_fwd_ch1/s_axis_config_tvalid] \
    [get_bd_pins xfft_fwd_ch2/s_axis_config_tvalid]
# Each xfft M_AXIS_DATA carries TDATA plus the BFP block exponent on TUSER.
connect_bd_intf_net [get_bd_intf_pins xfft_fwd_ch1/M_AXIS_DATA] [get_bd_intf_pins fft_capbuf_ch1/S_AXIS]
connect_bd_intf_net [get_bd_intf_pins xfft_fwd_ch2/M_AXIS_DATA] [get_bd_intf_pins fft_capbuf_ch2/S_AXIS]

# xfft publishes a LAYERED_METADATA description of its output payload that a
# -type module cell has no parameters to hold. Copying it onto the sink pin makes
# the two agree. Read from the core rather than written out, so a retuned FFT
# carries its own description across.
foreach ch {ch1 ch2} {
    set_property CONFIG.LAYERED_METADATA \
        [get_property CONFIG.LAYERED_METADATA [get_bd_intf_pins xfft_fwd_$ch/M_AXIS_DATA]] \
        [get_bd_intf_pins fft_capbuf_$ch/S_AXIS]
}
connect_bd_intf_net [get_bd_intf_pins fft_capbuf_ch1/M_AXIS]    [get_bd_intf_pins ch_combine/S00_AXIS]
connect_bd_intf_net [get_bd_intf_pins fft_capbuf_ch2/M_AXIS]    [get_bd_intf_pins ch_combine/S01_AXIS]
connect_bd_intf_net [get_bd_intf_pins ch_combine/M_AXIS]        [get_bd_intf_pins readback_mux/S_AXIS_FREQ]

# --- Time path into the mux; mux out to the host ---
connect_bd_intf_net [get_bd_intf_pins adc_dwidth/M_AXIS]    [get_bd_intf_pins readback_mux/S_AXIS_TIME]
connect_bd_intf_net [get_bd_intf_pins readback_mux/M_AXIS] [get_bd_intf_pins FrontPanel/S_AXIS]

# --- datapath_ctrl wiring: readback select and capture status ---
connect_bd_net [get_bd_pins datapath_ctrl/cfg_path_sel]  [get_bd_pins readback_mux/path_sel]
connect_bd_net [get_bd_pins datapath_ctrl/ctrl_arm] [get_bd_pins fft_capbuf_ch1/arm] [get_bd_pins fft_capbuf_ch2/arm]
connect_bd_net [get_bd_pins adc_capbuf/read_count]       [get_bd_pins readback_mux/read_count_time]
# Both fd_capbufs report the same freq beat count (1 header + DEPTH); ch1 drives the mux.
connect_bd_net [get_bd_pins fft_capbuf_ch1/read_count]   [get_bd_pins readback_mux/read_count_freq]
connect_bd_net [get_bd_pins readback_mux/read_count]     [get_bd_pins datapath_ctrl/read_count]
# capture_done = freq frame loaded, so the time frame is captured and the forward
# FFT has filled. Both cores run lockstep off the broadcaster.
connect_bd_net [get_bd_pins fft_capbuf_ch1/frame_loaded] [get_bd_pins datapath_ctrl/st_capture_done]

# Address map: datapath_ctrl at 0x0000, syzygy_dac CSR at 0x1000, syzygy_adc CSR at 0x2000,
# each 4 KB. Assigned before the cells are grouped below so the paths are flat.
assign_bd_address -offset 0x00000000 -range 0x00001000 \
    -target_address_space [get_bd_addr_spaces FrontPanel/M_AXIL] \
    [get_bd_addr_segs datapath_ctrl/S_AXI/reg0] -force
# A slave segment path is <cell>/<memory map>/<address block>, so these take the
# map name dac_csr / adc_csr, not the s_axi_csr pin name used to wire them above.
assign_bd_address -offset 0x00001000 -range 0x00001000 \
    -target_address_space [get_bd_addr_spaces FrontPanel/M_AXIL] \
    [get_bd_addr_segs syzygy_dac/dac_csr/reg0] -force
assign_bd_address -offset 0x00002000 -range 0x00001000 \
    -target_address_space [get_bd_addr_spaces FrontPanel/M_AXIL] \
    [get_bd_addr_segs syzygy_adc/adc_csr/reg0] -force

# Hierarchies, one block per datapath:
#   dac_path  IFFT -> dac_convert -> dac_playbuf -> syzygy_dac (+ clk_wiz_dac)
#   adc_path  syzygy_adc -> adc_capbuf -> adc_dwidth (+ clk_wiz_adc)
#   fft_fwd   axis_broadcaster -> 2x xfft(fwd) -> 2x fd_capbuf -> axis_combiner
# FrontPanel, datapath_ctrl, axi_crossbar, proc_sys_reset and readback_mux stay at the top.
group_bd_cells dac_path [get_bd_cells {clk_wiz_dac xfft_inv fft_cfg_inv dac_convert dac_playbuf syzygy_dac}]
group_bd_cells adc_path [get_bd_cells {clk_wiz_adc syzygy_adc adc_capbuf adc_dwidth}]
group_bd_cells fft_fwd [get_bd_cells {ch_split xfft_fwd_ch1 xfft_fwd_ch2 fwd_cfg_tvalid_tie fft_capbuf_ch1 fft_capbuf_ch2 ch_combine}]

# --- Hierarchy interface pin names ---
# set_property name on a pin that already holds the requested name does not
# no-op: Vivado treats the name as taken and uniquifies to <new>_1.
# get_bd_intf_pins matches case insensitively, so the pin is found under either
# spelling and the actual name has to be compared before renaming.
proc rename_intf_pin {hier old new} {
    set pin [get_bd_intf_pins $hier/$old -quiet]
    if {$pin eq ""} { set pin [get_bd_intf_pins $hier/$new -quiet] }
    if {$pin eq ""} {
        error "FFTSCOPE: no interface pin '$hier/$old' (or '$hier/$new') to rename"
    }
    if {[get_property name $pin] eq $new} { return }
    set_property name $new $pin
}

rename_intf_pin adc_path M_AXIS      M_AXIS_TIME
rename_intf_pin adc_path m_axis_fft  M_AXIS_FFT
rename_intf_pin adc_path s_axi_csr   S_AXI_CSR
rename_intf_pin dac_path S_AXIS_DATA S_AXIS_SPECTRUM
rename_intf_pin dac_path s_axi_csr   S_AXI_CSR
rename_intf_pin fft_fwd  S_AXIS      S_AXIS_TIME
rename_intf_pin fft_fwd  M_AXIS      M_AXIS_FREQ

# Finalize
regenerate_bd_layout
validate_bd_design
save_bd_design

# --- Top-level wrapper, renamed per variant ---
# make_wrapper names the module after the block design, so both variants would
# emit fftscope_bd_wrapper and therefore the same bitstream name, with nothing to
# say which pod it targets. Generate the wrapper, re-emit it as $top_name, and
# take that as top so impl writes $top_name.bit.
#
# Underscore, not hyphen: the directory is "FFTScope-12" but '-' is not legal in a
# Verilog identifier, so the module and file are "fftscope_12".
set top_name fftscope_12

set bd_file  [get_files [file join $out_dir $proj.srcs sources_1 bd $bd $bd.bd]]
set wrap_src [lindex [make_wrapper -files $bd_file -top] 0]
if {$wrap_src eq "" || ![file exists $wrap_src]} {
    # Fall back to the canonical generated-sources path if make_wrapper's return
    # value ever changes shape.
    set wrap_src [file join $out_dir $proj.gen sources_1 bd $bd hdl fftscope_12.v]
}
if {![file exists $wrap_src]} {
    error "FFTSCOPE: generated BD wrapper not found (looked at '$wrap_src')"
}

# -translation binary on both channels: Vivado writes the wrapper LF-only, but
# Tcl's default output translation on Windows is crlf, which would rewrite every
# line ending.
set fh [open $wrap_src r]
fconfigure $fh -translation binary
set wrap_txt [read $fh]
close $fh
# Rename the module declaration only. The instantiated BD and the tool-written
# header comments are left alone, so the file still records its origin.
if {![string match "*module ${bd}_wrapper*" $wrap_txt]} {
    error "FFTSCOPE: 'module ${bd}_wrapper' not found in $wrap_src - wrapper format changed"
}
set wrap_txt [string map [list "module ${bd}_wrapper" "module $top_name"] $wrap_txt]

set wrap_dst [file join $out_dir ${top_name}.v]
set fh [open $wrap_dst w]
fconfigure $fh -translation binary
puts $fh "// GENERATED by project.tcl - do not edit, rewritten on every build."
puts $fh "// [file tail $wrap_src] re-emitted as module '$top_name' so the two"
puts $fh "// FFTScope variants produce distinguishable bitstreams."
puts -nonewline $fh $wrap_txt
close $fh

add_files -norecurse $wrap_dst
set_property top $top_name [current_fileset]
update_compile_order -fileset sources_1

puts "FFTSCOPE: top module = $top_name  ($wrap_dst)"
puts "FFTSCOPE: project.tcl complete (out=$out_dir)"
