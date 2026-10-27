# Copyright (c) 2024-2026 Opal Kelly Incorporated
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.
#
# Board: SZG-HUB1450-AU10P-10G  (xcau10p-ffvb676-1-e)
#
# The FrontPanel IP's scoped XDC owns the host-interface pins (okHU/okUH/okUHU),
# the host clock, and the host I/O delays. This file carries the device-config
# rows and the user pins: DAC port A, ADC port B, and the sample clocks.
#
# project.tcl externalizes the syzygy_dac / syzygy_adc pod interfaces whole, so
# the top-level port names are <iface>_<logical>, for example szg_dac_db[11:0].

set_property CFGBVS GND          [current_design]
set_property CONFIG_VOLTAGE 1.8  [current_design]
set_property BITSTREAM.GENERAL.COMPRESS True [current_design]

# =============================================================================
# SZG-DAC-AD911X on SYZYGY PORT A (LVCMOS18)
# Package pins are the szg_porta_* locs from the board file. SYZYGY signal Sn ->
# board pin szg_porta_sN. DAC pod mapping (szg-dac-ad911x):
#   S0..S11 = DB0..DB11 data, S12=CS_B, S13=SCLK, S14=SDIO, S15=OPAMP_ENABLE,
#   S16=RESET/PINMD, C2P_CLKp=CLKIN (sample clock to the pod).
# =============================================================================

# --- 12-bit parallel data: szg_dac_db[0..11] -> S0..S11 ---
set_property PACKAGE_PIN AE25 [get_ports {szg_dac_db[0]}]
set_property PACKAGE_PIN AD24 [get_ports {szg_dac_db[1]}]
set_property PACKAGE_PIN AE26 [get_ports {szg_dac_db[2]}]
set_property PACKAGE_PIN AD25 [get_ports {szg_dac_db[3]}]
set_property PACKAGE_PIN AB25 [get_ports {szg_dac_db[4]}]
set_property PACKAGE_PIN AA22 [get_ports {szg_dac_db[5]}]
set_property PACKAGE_PIN AB26 [get_ports {szg_dac_db[6]}]
set_property PACKAGE_PIN AB22 [get_ports {szg_dac_db[7]}]
set_property PACKAGE_PIN AF24 [get_ports {szg_dac_db[8]}]
set_property PACKAGE_PIN AB24 [get_ports {szg_dac_db[9]}]
set_property PACKAGE_PIN AF25 [get_ports {szg_dac_db[10]}]
set_property PACKAGE_PIN AC24 [get_ports {szg_dac_db[11]}]

# --- Forwarded DAC sample clock: szg_dac_clkin -> C2P_CLKp (CLKIN) ---
set_property PACKAGE_PIN AD23 [get_ports {szg_dac_clkin}]

# --- SPI / control straps ---
set_property PACKAGE_PIN AC26 [get_ports {szg_dac_cs_b}]        ;# S12 CS_B
set_property PACKAGE_PIN AD21 [get_ports {szg_dac_sclk}]        ;# S13 SCLK
set_property PACKAGE_PIN AD26 [get_ports {szg_dac_sdio*}]       ;# S14 SDIO/FORMAT (inout)
set_property PACKAGE_PIN AC16 [get_ports {szg_dac_reset_pinmd}] ;# S16 RESET/PINMD
# S15 OPAMP_ENABLE is not constrained: the pod has a built-in pull-up, so the
# FPGA leaves it unconnected.

set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_db[*]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_clkin szg_dac_cs_b szg_dac_sclk szg_dac_sdio* szg_dac_reset_pinmd}]
set_property SLEW FAST [get_ports {szg_dac_db[*] szg_dac_clkin}]

# --- Clocking: dac_sample_clk (clk_wiz from aclk) is asynchronous to the
#     156.25 MHz aclk fabric. The CDC is the syzygy_dac IP's internal async FIFO
#     (xpm_fifo_async), which carries its own scoped CDC constraints. ---
set_clock_groups -asynchronous -group \
    [get_clocks -include_generated_clocks -of_objects \
        [get_pins -hierarchical -filter {NAME =~ *clk_wiz_dac*clk_out1}]]

# szg_dac_clkin is ODDR-forwarded from dac_sample_clk, so the 12-bit bus is
# edge-aligned to it by construction at the AD9116's 125 MSPS max rate. A
# source-synchronous create_generated_clock plus set_output_delay on szg_dac_db
# would refine the data eye; basic tone playback does not need it.

# =============================================================================
# SZG-ADC-LTC2268-14 on SYZYGY PORT B (LVDS data/clocks, LVCMOS18 SPI)
# szg_portb_* locs from the board file; peripheral signal map from the
# SZG-ADC-LTC226X doc. PORT B VIO must be 1.8 V for LVDS (= CONFIG_VOLTAGE).
#   Data lanes (2/ch): szg_adc_out1 = OUT1A(D0)/OUT1B(D2), szg_adc_out2 = OUT2A(D3)/OUT2B(D5)
#   szg_adc_fr = FR(D1)  szg_adc_dco = DCO(P2C_CLK, in)  szg_adc_enc = ENC(C2P_CLK, out)
#   SPI (S8/S10/S12/S14): szg_adc_sdo/szg_adc_cs_b/szg_adc_sclk/szg_adc_sdi
# =============================================================================

# --- Channel 1 data (OUT1A=D0, OUT1B=D2) ---
set_property PACKAGE_PIN AA19 [get_ports {szg_adc_out1_p[0]}] ;# D0P OUT1A+
set_property PACKAGE_PIN AB19 [get_ports {szg_adc_out1_n[0]}] ;# D0N OUT1A-
set_property PACKAGE_PIN Y17  [get_ports {szg_adc_out1_p[1]}] ;# D2P OUT1B+
set_property PACKAGE_PIN AA17 [get_ports {szg_adc_out1_n[1]}] ;# D2N OUT1B-
# --- Channel 2 data (OUT2A=D3, OUT2B=D5) ---
set_property PACKAGE_PIN Y18  [get_ports {szg_adc_out2_p[0]}] ;# D3P OUT2A+
set_property PACKAGE_PIN AA18 [get_ports {szg_adc_out2_n[0]}] ;# D3N OUT2A-
set_property PACKAGE_PIN AA20 [get_ports {szg_adc_out2_p[1]}] ;# D5P OUT2B+
set_property PACKAGE_PIN AB20 [get_ports {szg_adc_out2_n[1]}] ;# D5N OUT2B-
# --- Frame (D1), DCO (P2C_CLK, in), Encode (C2P_CLK, out) ---
set_property PACKAGE_PIN Y20  [get_ports {szg_adc_fr_p}]      ;# D1P FR+
set_property PACKAGE_PIN Y21  [get_ports {szg_adc_fr_n}]      ;# D1N FR-
set_property PACKAGE_PIN AD20 [get_ports {szg_adc_dco_p}]     ;# P2C_CLKp DCO+
set_property PACKAGE_PIN AE20 [get_ports {szg_adc_dco_n}]     ;# P2C_CLKn DCO-
set_property PACKAGE_PIN AF18 [get_ports {szg_adc_enc_p}]     ;# C2P_CLKp ENC+
set_property PACKAGE_PIN AF19 [get_ports {szg_adc_enc_n}]     ;# C2P_CLKn ENC-

set_property IOSTANDARD LVDS [get_ports {szg_adc_out1_p[*] szg_adc_out1_n[*] szg_adc_out2_p[*] szg_adc_out2_n[*]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_fr_p szg_adc_fr_n szg_adc_dco_p szg_adc_dco_n szg_adc_enc_p szg_adc_enc_n}]
# On-die differential termination on the LVDS INPUTS (data + DCO + FR); not on the
# encode output the FPGA drives.
set_property DIFF_TERM_ADV TERM_100 \
    [get_ports {szg_adc_out1_p[*] szg_adc_out1_n[*] szg_adc_out2_p[*] szg_adc_out2_n[*] szg_adc_fr_p szg_adc_fr_n szg_adc_dco_p szg_adc_dco_n}]

# --- SPI (S8/S10/S12/S14, LVCMOS18) ---
set_property PACKAGE_PIN AE17 [get_ports {szg_adc_sdo}]  ;# S8  SDO  (in)
set_property PACKAGE_PIN AF17 [get_ports {szg_adc_cs_b}] ;# S10 CS_B (out)
set_property PACKAGE_PIN AD16 [get_ports {szg_adc_sclk}] ;# S12 SCLK (out)
set_property PACKAGE_PIN AE16 [get_ports {szg_adc_sdi}]  ;# S14 SDI  (out)
set_property IOSTANDARD LVCMOS18 [get_ports {szg_adc_sdo szg_adc_cs_b szg_adc_sclk szg_adc_sdi}]

# --- ADC DCO recovered clock: 500 MHz (LTC2268-14 at full 125 MSPS, 4x the
#     125 MHz encode). There is no MMCM in the IP: the DCO feeds two BUFGCE_DIVs
#     directly (/1 = the ISERDES bit clock, /4 = adc_data_clk), which Vivado
#     auto-derives as generated clocks off this create_clock. (The 12-bit sibling
#     build runs this at 160 MHz / period 6.250 for 40 MSPS.) ---
create_clock -name adc_dco -period 2.000 [get_ports szg_adc_dco_p]

# --- Async clock groups: the ADC DCO domain and the clk_wiz_adc encode output
#     (125 MHz) are both asynchronous to aclk and to dac_sample_clk (the
#     syzygy_adc FIFO + td_capbuf are the crossings).
#
#     The filter matches clk_out*, not clk_out1, so any output added to
#     clk_wiz_adc stays in the async group. ---
set_clock_groups -asynchronous -group [get_clocks -include_generated_clocks adc_dco]
set_clock_groups -asynchronous -group \
    [get_clocks -include_generated_clocks -of_objects \
        [get_pins -hierarchical -filter {NAME =~ *clk_wiz_adc*clk_out*}]]
