############################################################################
# XEM8320 - Xilinx constraints file
#
# Pin mappings for the XEM8320.  Use this as a template and comment out
# the pins that are not used in your design.  (By default, map will fail
# if this file contains constraints for signals not in your design).
#
# Copyright (c) 2004-2024 Opal Kelly Incorporated
############################################################################

set_property CFGBVS GND [current_design]
set_property CONFIG_VOLTAGE 1.8 [current_design]
set_property BITSTREAM.GENERAL.COMPRESS True [current_design]

############################################################################
## SYZYGY Ports
############################################################################
## DAC ##
# PORTA-5
set_property PACKAGE_PIN L18 [get_ports {szg_dac_ad911x_db[0]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[0]}]

# PORTA-6
set_property PACKAGE_PIN M25 [get_ports {szg_dac_ad911x_db[1]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[1]}]

# PORTA-7
set_property PACKAGE_PIN K18 [get_ports {szg_dac_ad911x_db[2]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[2]}]

# PORTA-8
set_property PACKAGE_PIN M26 [get_ports {szg_dac_ad911x_db[3]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[3]}]

# PORTA-9
set_property PACKAGE_PIN M20 [get_ports {szg_dac_ad911x_db[4]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[4]}]

# PORTA-10
set_property PACKAGE_PIN L24 [get_ports {szg_dac_ad911x_db[5]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[5]}]

# PORTA-11
set_property PACKAGE_PIN M21 [get_ports {szg_dac_ad911x_db[6]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[6]}]

# PORTA-12
set_property PACKAGE_PIN L25 [get_ports {szg_dac_ad911x_db[7]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[7]}]

# PORTA-13
set_property PACKAGE_PIN J19 [get_ports {szg_dac_ad911x_db[8]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[8]}]

# PORTA-14
set_property PACKAGE_PIN K25 [get_ports {szg_dac_ad911x_db[9]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[9]}]

# PORTA-15
set_property PACKAGE_PIN J20 [get_ports {szg_dac_ad911x_db[10]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[10]}]

# PORTA-16
set_property PACKAGE_PIN K26 [get_ports {szg_dac_ad911x_db[11]}]
set_property IOSTANDARD LVCMOS18 [get_ports {szg_dac_ad911x_db[11]}]

# PORTA-17
set_property PACKAGE_PIN L22 [get_ports szg_dac_ad911x_cs_b]
set_property IOSTANDARD LVCMOS18 [get_ports szg_dac_ad911x_cs_b]

# PORTA-18
set_property PACKAGE_PIN K22 [get_ports szg_dac_ad911x_sclk]
set_property IOSTANDARD LVCMOS18 [get_ports szg_dac_ad911x_sclk]

# PORTA-19
set_property PACKAGE_PIN L23 [get_ports szg_dac_ad911x_sdio_io]
set_property IOSTANDARD LVCMOS18 [get_ports szg_dac_ad911x_sdio_io]

# PORTA-20

# PORTA-21
set_property PACKAGE_PIN H24 [get_ports szg_dac_ad911x_reset_pinmd]
set_property IOSTANDARD LVCMOS18 [get_ports szg_dac_ad911x_reset_pinmd]

# PORTA-34
set_property PACKAGE_PIN H26 [get_ports szg_dac_ad911x_clkin]
set_property IOSTANDARD LVCMOS18 [get_ports szg_dac_ad911x_clkin]

##########################################################
# ADC Section
##########################################################

# PORTB-5
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out1_p[0]}]

# PORTB-6
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_fr_p]

# PORTB-7
set_property PACKAGE_PIN A22 [get_ports {szg_adc_ltc226x_out1_p[0]}]
set_property PACKAGE_PIN A23 [get_ports {szg_adc_ltc226x_out1_n[0]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out1_n[0]}]

# PORTB-8
set_property PACKAGE_PIN A24 [get_ports szg_adc_ltc226x_fr_p]
set_property PACKAGE_PIN A25 [get_ports szg_adc_ltc226x_fr_n]
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_fr_n]

# PORTB-9
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out1_p[1]}]

# PORTB-10
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out2_p[0]}]

# PORTB-11
set_property PACKAGE_PIN E21 [get_ports {szg_adc_ltc226x_out1_p[1]}]
set_property PACKAGE_PIN D21 [get_ports {szg_adc_ltc226x_out1_n[1]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out1_n[1]}]

# PORTB-12
set_property PACKAGE_PIN D24 [get_ports {szg_adc_ltc226x_out2_p[0]}]
set_property PACKAGE_PIN D25 [get_ports {szg_adc_ltc226x_out2_n[0]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out2_n[0]}]

# PORTB-13
set_property PACKAGE_PIN E25 [get_ports szg_adc_ltc226x_sdo]
set_property IOSTANDARD LVCMOS18 [get_ports szg_adc_ltc226x_sdo]

# PORTB-14
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out2_p[1]}]

# PORTB-15
set_property PACKAGE_PIN E26 [get_ports szg_adc_ltc226x_cs_b]
set_property IOSTANDARD LVCMOS18 [get_ports szg_adc_ltc226x_cs_b]

# PORTB-16
set_property PACKAGE_PIN C23 [get_ports {szg_adc_ltc226x_out2_p[1]}]
set_property PACKAGE_PIN B24 [get_ports {szg_adc_ltc226x_out2_n[1]}]
set_property IOSTANDARD LVDS [get_ports {szg_adc_ltc226x_out2_n[1]}]

# PORTB-17
set_property PACKAGE_PIN F23 [get_ports szg_adc_ltc226x_sclk]
set_property IOSTANDARD LVCMOS18 [get_ports szg_adc_ltc226x_sclk]

# PORTB-19
set_property PACKAGE_PIN E23 [get_ports szg_adc_ltc226x_sdi]
set_property IOSTANDARD LVCMOS18 [get_ports szg_adc_ltc226x_sdi]

# PORTB-33
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_dco_p]

# PORTB-34
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_enc_p]

# PORTB-35
set_property PACKAGE_PIN G24 [get_ports szg_adc_ltc226x_dco_p]
set_property PACKAGE_PIN G25 [get_ports szg_adc_ltc226x_dco_n]
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_dco_n]

# PORTB-36
set_property PACKAGE_PIN H21 [get_ports szg_adc_ltc226x_enc_p]
set_property PACKAGE_PIN H22 [get_ports szg_adc_ltc226x_enc_n]
set_property IOSTANDARD LVDS [get_ports szg_adc_ltc226x_enc_n]

############################################################################
## Timing
############################################################################
set_property CLOCK_DEDICATED_ROUTE BACKBONE [get_nets FFTScope_i/clk_wiz_0/inst/clk_out1]

# DAC timing constraints
create_generated_clock -name dac_clk -source [get_ports szg_dac_ad911x_clkin] -divide_by 1 [get_ports szg_dac_ad911x_clkin]
set_output_delay -clock [get_clocks dac_clk] -clock_fall -max -add_delay 0.25 [get_ports {szg_dac_ad911x_db[*]}]
set_output_delay -clock [get_clocks dac_clk] -clock_fall -min -add_delay -1.2 [get_ports {szg_dac_ad911x_db[*]}]
set_output_delay -clock [get_clocks dac_clk] -max -add_delay 0.13 [get_ports {szg_dac_ad911x_db[*]}]
set_output_delay -clock [get_clocks dac_clk] -min -add_delay -1.1 [get_ports {szg_dac_ad911x_db[*]}]

# ADC timing constraints
create_clock -period 6.250 -name szg_adc_ltc226x_dco_p -waveform {0.000 3.125} [get_ports szg_adc_ltc226x_dco_p]


set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_out1_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_out1_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_out1_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_out1_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_out1_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_out1_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_out1_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_out1_n[*]}]

set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_out2_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_out2_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_out2_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_out2_p[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_out2_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_out2_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_out2_n[*]}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_out2_n[*]}]

set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_fr_p}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_fr_p}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_fr_p}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_fr_p}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_fr_n}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -clock_fall -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_fr_n}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -min -add_delay 1.090 [get_ports {szg_adc_ltc226x_fr_n}]
set_input_delay -clock [get_clocks szg_adc_ltc226x_dco_p] -max -add_delay 2.035 [get_ports {szg_adc_ltc226x_fr_n}]

# Internal CDC synchronizers (sample clock -> okClk, or adc/spi handshake).
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_adc_rdy_i/ff1_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_fifo_busy_i/ff1_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_rsta_busy_i/ff1_reg"}]

# WireIn CDC synchronizers (okClk -> sample clock).
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_wi00_reset_i/ff1_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_wi00_dac_disable_i/ff1_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_wi02_reset_i/ff1_reg"}]

# WireOut CDC synchronizers (sample clock or async -> okClk).
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_wo20_locked_i/ff1_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_wo20_dac_ready_i/ff1_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_wo21_locked_i/ff1_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_wo21_prog_full_i/ff1_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_wo22_locked_i/ff1_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_wo22_tx_prog_empty_i/ff1_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/cdc_sync_2ff_wo22_rx_prog_full_i/ff1_reg"}]

# adc_top FSM flops take wi01[0] (okClk) on their async CLR/PRE pins.
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/adc_impl/reset_sync_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/adc_impl/clock_rdy_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/adc_impl/reset_SERDES_hold_reg"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/adc_impl/reset_serdes_cnt_reg[*]"}]

# FP IP TriggerIn 2FF CDC (okClk -> EP_CLK) first-stage capture.
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/frontpanel_0/inst/ti40/trigff0_reg[*]"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/frontpanel_0/inst/ti41/trigff0_reg[*]"}]
set_false_path -to [get_cells -hierarchical -filter {NAME =~ "*/frontpanel_0/inst/ti42/trigff0_reg[*]"}]
